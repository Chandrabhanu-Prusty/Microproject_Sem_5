import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoDB } from '../config/aws.js';
import { getEnv } from '../config/env.js';
import type {
  RsvpItem,
  WaitlistItem,
  ReserveTicketInput,
  EventTicketMetadata,
} from '../types/rsvp.js';
import { AppError } from '../utils/errors.js';

export interface ReserveConfirmedResult {
  success: boolean;
  reason?:
    | 'DUPLICATE_REGISTRATION'
    | 'EVENT_FULL'
    | 'EVENT_NOT_PUBLISHED'
    | 'REGISTRATION_CLOSED'
    | 'TRANSACTION_FAILED';
}

export interface JoinWaitlistResult {
  success: boolean;
  reason?:
    | 'DUPLICATE_REGISTRATION'
    | 'SEAT_AVAILABLE'
    | 'EVENT_NOT_PUBLISHED'
    | 'REGISTRATION_CLOSED'
    | 'TRANSACTION_FAILED';
}

export interface PromoteResult {
  success: boolean;
  reason?:
    | 'CONCURRENT_PROMOTION_CONFLICT'
    | 'RSVP_NOT_FOUND'
    | 'TICKET_ALREADY_CHECKED_IN'
    | 'TICKET_NOT_FOUND'
    | 'EVENT_STARTED'
    | 'TRANSACTION_FAILED';
}

export interface CancelConfirmedNoWaitlistResult {
  success: boolean;
  reason?:
    | 'WAITLIST_NOT_EMPTY'
    | 'RSVP_NOT_FOUND'
    | 'TICKET_ALREADY_CHECKED_IN'
    | 'TICKET_NOT_FOUND'
    | 'TRANSACTION_FAILED';
}

export interface CancelWaitlistedResult {
  success: boolean;
  reason?: 'CONCURRENT_WAITLIST_CONFLICT' | 'RSVP_NOT_FOUND' | 'TRANSACTION_FAILED';
}

export class RsvpRepository {
  private docClient: DynamoDBDocumentClient | null = null;

  constructor(customDocClient?: DynamoDBDocumentClient) {
    if (customDocClient) {
      this.docClient = customDocClient;
    }
  }

  private getClient(): DynamoDBDocumentClient {
    if (!this.docClient) {
      this.docClient = getDynamoDB();
    }
    return this.docClient;
  }

  private get rsvpsTable(): string {
    return getEnv().RSVPS_TABLE;
  }

  private get eventsTable(): string {
    return getEnv().EVENTS_TABLE;
  }

  private get waitlistTable(): string {
    return getEnv().WAITLIST_TABLE;
  }

  private get ticketsTable(): string {
    return getEnv().TICKETS_TABLE;
  }

  /**
   * Retrieves an attendee's active RSVP state for an event with strongly consistent read.
   */
  async findByEventAndAttendee(eventId: string, attendeeId: string): Promise<RsvpItem | null> {
    const result = await this.getClient().send(
      new GetCommand({
        TableName: this.rsvpsTable,
        Key: { eventId, attendeeId },
        ConsistentRead: true,
      })
    );
    return (result.Item as RsvpItem) ?? null;
  }

  /**
   * Executes atomic reservation transaction reserving a confirmed seat.
   * Increments confirmedCount on MarqueEvents, puts CONFIRMED RSVP on MarqueRSVPs,
   * and creates ACTIVE ticket on MarqueTickets in the same atomic transaction.
   * Requires strictly valid ReserveTicketInput with no fabricated defaults.
   */
  async reserveConfirmedSeat(
    eventId: string,
    attendeeId: string,
    rsvpId: string,
    ticketInput: ReserveTicketInput
  ): Promise<ReserveConfirmedResult> {
    const now = new Date().toISOString();

    if (!ticketInput.ticketId || !ticketInput.attendeeName || !ticketInput.attendeeEmail) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Incomplete attendee ticket data.');
    }
    if (!ticketInput.eventTitle || !ticketInput.eventVenue || !ticketInput.eventStartAt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Incomplete event metadata for ticket issuance.');
    }

    try {
      await this.getClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.eventsTable,
                Key: { eventId },
                UpdateExpression: 'SET confirmedCount = confirmedCount + :inc, updatedAt = :now',
                ConditionExpression: '#status = :published AND confirmedCount < #capacity AND #startAt > :now',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#startAt': 'startAt',
                  '#capacity': 'capacity',
                },
                ExpressionAttributeValues: {
                  ':inc': 1,
                  ':now': now,
                  ':published': 'PUBLISHED',
                },
              },
            },
            {
              Put: {
                TableName: this.rsvpsTable,
                Item: {
                  eventId,
                  attendeeId,
                  rsvpId,
                  status: 'CONFIRMED',
                  ticketId: ticketInput.ticketId,
                  createdAt: now,
                  updatedAt: now,
                },
                ConditionExpression: 'attribute_not_exists(attendeeId) OR #status = :cancelled',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':cancelled': 'CANCELLED',
                },
              },
            },
            {
              Put: {
                TableName: this.ticketsTable,
                Item: {
                  ticketId: ticketInput.ticketId,
                  eventId,
                  attendeeId,
                  attendeeName: ticketInput.attendeeName,
                  attendeeEmail: ticketInput.attendeeEmail,
                  eventTitle: ticketInput.eventTitle,
                  eventVenue: ticketInput.eventVenue,
                  eventStartAt: ticketInput.eventStartAt,
                  status: 'ACTIVE',
                  issuedAt: now,
                },
                ConditionExpression: 'attribute_not_exists(ticketId)',
              },
            },
          ],
        })
      );
      return { success: true };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        err.name === 'TransactionCanceledException'
      ) {
        const reasons = (err as any).CancellationReasons || [];
        // Index 1: RSVP conditional Put failed -> Duplicate registration
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'DUPLICATE_REGISTRATION' };
        }
        // Index 0: Event update failed
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          try {
            const eventCheck = await this.getClient().send(
              new GetCommand({
                TableName: this.eventsTable,
                Key: { eventId },
                ConsistentRead: true,
              })
            );
            const currentEvent = eventCheck.Item;
            if (!currentEvent || currentEvent.status !== 'PUBLISHED') {
              return { success: false, reason: 'EVENT_NOT_PUBLISHED' };
            }
            if (currentEvent.startAt && currentEvent.startAt <= now) {
              return { success: false, reason: 'REGISTRATION_CLOSED' };
            }
          } catch {
            // fallback if event check read throws
          }
          return { success: false, reason: 'EVENT_FULL' };
        }
      }
      throw err;
    }
  }

  /**
   * Executes atomic waitlist transaction.
   * Increments waitlistCount on MarqueEvents, puts WAITLISTED RSVP on MarqueRSVPs,
   * and inserts FIFO queue entry into MarqueWaitlist.
   */
  async joinWaitlist(
    eventId: string,
    attendeeId: string,
    rsvpId: string,
    queueKey: string,
    attendeeName: string | undefined,
    attendeeEmail: string
  ): Promise<JoinWaitlistResult> {
    const now = new Date().toISOString();
    const resolvedName =
      attendeeName && attendeeName.trim().length > 0 ? attendeeName.trim() : 'Waitlisted Attendee';

    try {
      await this.getClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.eventsTable,
                Key: { eventId },
                UpdateExpression: 'SET waitlistCount = if_not_exists(waitlistCount, :zero) + :inc, updatedAt = :now',
                ConditionExpression: '#status = :published AND confirmedCount >= #capacity AND #startAt > :now',
                ExpressionAttributeNames: {
                  '#status': 'status',
                  '#startAt': 'startAt',
                  '#capacity': 'capacity',
                },
                ExpressionAttributeValues: {
                  ':zero': 0,
                  ':inc': 1,
                  ':now': now,
                  ':published': 'PUBLISHED',
                },
              },
            },
            {
              Put: {
                TableName: this.rsvpsTable,
                Item: {
                  eventId,
                  attendeeId,
                  rsvpId,
                  status: 'WAITLISTED',
                  queueKey,
                  createdAt: now,
                  updatedAt: now,
                },
                ConditionExpression: 'attribute_not_exists(attendeeId) OR #status = :cancelled',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':cancelled': 'CANCELLED',
                },
              },
            },
            {
              Put: {
                TableName: this.waitlistTable,
                Item: {
                  eventId,
                  queueKey,
                  attendeeId,
                  attendeeName: resolvedName,
                  attendeeEmail,
                  status: 'WAITING',
                  createdAt: now,
                },
                ConditionExpression: 'attribute_not_exists(queueKey)',
              },
            },
          ],
        })
      );
      return { success: true };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        err.name === 'TransactionCanceledException'
      ) {
        const reasons = (err as any).CancellationReasons || [];
        // Index 1 or 2: RSVP / Waitlist duplicate check failed
        if (reasons[1]?.Code === 'ConditionalCheckFailed' || reasons[2]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'DUPLICATE_REGISTRATION' };
        }
        // Index 0: Event update failed
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          try {
            const eventCheck = await this.getClient().send(
              new GetCommand({
                TableName: this.eventsTable,
                Key: { eventId },
                ConsistentRead: true,
              })
            );
            const currentEvent = eventCheck.Item;
            if (!currentEvent || currentEvent.status !== 'PUBLISHED') {
              return { success: false, reason: 'EVENT_NOT_PUBLISHED' };
            }
            if (currentEvent.startAt && currentEvent.startAt <= now) {
              return { success: false, reason: 'REGISTRATION_CLOSED' };
            }
          } catch {
            // fallback
          }
          return { success: false, reason: 'SEAT_AVAILABLE' };
        }
      }
      throw err;
    }
  }

  /**
   * Retrieves the oldest FIFO candidate from MarqueWaitlist using strongly consistent read.
   */
  async getOldestWaitlistEntry(eventId: string): Promise<WaitlistItem | null> {
    const result = await this.getClient().send(
      new QueryCommand({
        TableName: this.waitlistTable,
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: {
          ':eventId': eventId,
        },
        ScanIndexForward: true, // Chronological ordering (oldest first)
        Limit: 1,
        ConsistentRead: true,
      })
    );

    if (result.Items && result.Items.length > 0) {
      return result.Items[0] as WaitlistItem;
    }
    return null;
  }

  /**
   * Calculates the exact 1-based FIFO position of the attendee's queueKey using
   * base-table Query with partition key and sort key condition (queueKey <= :queueKey).
   * Fully paginates using LastEvaluatedKey.
   */
  async getWaitlistPosition(eventId: string, queueKey: string): Promise<number> {
    let totalCount = 0;
    let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;

    do {
      const result = await this.getClient().send(
        new QueryCommand({
          TableName: this.waitlistTable,
          KeyConditionExpression: 'eventId = :eventId AND queueKey <= :queueKey',
          ExpressionAttributeValues: {
            ':eventId': eventId,
            ':queueKey': queueKey,
          },
          Select: 'COUNT',
          ConsistentRead: true,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      totalCount += result.Count ?? 0;
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    if (totalCount === 0) {
      throw new AppError(500, 'WAITLIST_POSITION_ERROR', 'Failed to determine waitlist queue position.');
    }

    return totalCount;
  }

  /**
   * Returns current active waitlist entry count for an event via strongly consistent read,
   * paginating across all pages using LastEvaluatedKey.
   */
  async getWaitlistCount(eventId: string): Promise<number> {
    let totalCount = 0;
    let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;

    do {
      const result = await this.getClient().send(
        new QueryCommand({
          TableName: this.waitlistTable,
          KeyConditionExpression: 'eventId = :eventId',
          ExpressionAttributeValues: {
            ':eventId': eventId,
          },
          Select: 'COUNT',
          ConsistentRead: true,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );
      totalCount += result.Count ?? 0;
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return totalCount;
  }

  /**
   * Executes atomic promotion transaction:
   * 1. Updates cancelled attendee's RSVP to CANCELLED and removes ticketId AND queueKey.
   * 2. Atomically updates cancelling attendee's ACTIVE ticket to CANCELLED in MarqueTickets (enforcing #status = :active).
   * 3. Updates oldest waitlist candidate's RSVP to CONFIRMED with new ticketId.
   * 4. Creates candidate's new ticket with status ACTIVE in MarqueTickets using real event metadata.
   * 5. Deletes waitlist candidate's queue entry from MarqueWaitlist.
   * 6. Decrements waitlistCount on MarqueEvents with condition that #startAt > :now.
   */
  async promoteWaitlistEntry(
    eventId: string,
    cancelledAttendeeId: string,
    oldTicketId: string,
    candidate: WaitlistItem,
    newTicketId: string,
    eventMetadata: EventTicketMetadata
  ): Promise<PromoteResult> {
    const now = new Date().toISOString();
    const candidateName =
      candidate.attendeeName && candidate.attendeeName.trim().length > 0
        ? candidate.attendeeName.trim()
        : 'Waitlisted Attendee';

    if (!oldTicketId || oldTicketId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'oldTicketId is mandatory for confirmed promotion.');
    }

    const transactItems: any[] = [
      // 0. Update cancelled attendee's RSVP to CANCELLED and remove both ticketId and queueKey
      {
        Update: {
          TableName: this.rsvpsTable,
          Key: { eventId, attendeeId: cancelledAttendeeId },
          UpdateExpression: 'SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey',
          ConditionExpression: 'attribute_exists(eventId) AND #status = :confirmed',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':cancelled': 'CANCELLED',
            ':confirmed': 'CONFIRMED',
            ':now': now,
          },
        },
      },
      // 1. Mandatory old ticket update: cancelled only if currently ACTIVE
      {
        Update: {
          TableName: this.ticketsTable,
          Key: { ticketId: oldTicketId },
          UpdateExpression: 'SET #status = :cancelled, updatedAt = :now',
          ConditionExpression: 'attribute_exists(ticketId) AND #status = :active',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':cancelled': 'CANCELLED',
            ':active': 'ACTIVE',
            ':now': now,
          },
        },
      },
      // 2. Candidate RSVP update
      {
        Update: {
          TableName: this.rsvpsTable,
          Key: { eventId, attendeeId: candidate.attendeeId },
          UpdateExpression: 'SET #status = :confirmed, ticketId = :ticketId, updatedAt = :now REMOVE queueKey',
          ConditionExpression: 'attribute_exists(eventId) AND #status = :waitlisted',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':confirmed': 'CONFIRMED',
            ':waitlisted': 'WAITLISTED',
            ':ticketId': newTicketId,
            ':now': now,
          },
        },
      },
      // 3. Create candidate's new ticket in MarqueTickets using real event metadata
      {
        Put: {
          TableName: this.ticketsTable,
          Item: {
            ticketId: newTicketId,
            eventId,
            attendeeId: candidate.attendeeId,
            attendeeName: candidateName,
            attendeeEmail: candidate.attendeeEmail,
            eventTitle: eventMetadata.eventTitle,
            eventVenue: eventMetadata.eventVenue,
            eventStartAt: eventMetadata.eventStartAt,
            status: 'ACTIVE',
            issuedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(ticketId)',
        },
      },
      // 4. Delete candidate from MarqueWaitlist
      {
        Delete: {
          TableName: this.waitlistTable,
          Key: { eventId, queueKey: candidate.queueKey },
          ConditionExpression: 'attribute_exists(eventId) AND attribute_exists(queueKey)',
        },
      },
      // 5. Decrement waitlistCount on MarqueEvents, enforcing that event has not started
      {
        Update: {
          TableName: this.eventsTable,
          Key: { eventId },
          UpdateExpression: 'SET waitlistCount = waitlistCount - :dec, updatedAt = :now',
          ConditionExpression: 'waitlistCount > :zero AND #startAt > :now',
          ExpressionAttributeNames: {
            '#startAt': 'startAt',
          },
          ExpressionAttributeValues: {
            ':dec': 1,
            ':zero': 0,
            ':now': now,
          },
        },
      },
    ];

    try {
      await this.getClient().send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        })
      );
      return { success: true };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        err.name === 'TransactionCanceledException'
      ) {
        const reasons = (err as any).CancellationReasons || [];
        // Index 0: Cancelled RSVP condition failed
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'RSVP_NOT_FOUND' };
        }
        // Index 1: Old ticket condition failed: inspect ticket
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          try {
            const ticketCheck = await this.getClient().send(
              new GetCommand({
                TableName: this.ticketsTable,
                Key: { ticketId: oldTicketId },
                ConsistentRead: true,
              })
            );
            if (!ticketCheck.Item) {
              return { success: false, reason: 'TICKET_NOT_FOUND' };
            }
            if (ticketCheck.Item.status === 'CHECKED_IN') {
              return { success: false, reason: 'TICKET_ALREADY_CHECKED_IN' };
            }
          } catch {
            // fallback
          }
          return { success: false, reason: 'TICKET_NOT_FOUND' };
        }
        // Index 5: Event condition failed: check if event has started
        if (reasons[5]?.Code === 'ConditionalCheckFailed') {
          try {
            const eventCheck = await this.getClient().send(
              new GetCommand({
                TableName: this.eventsTable,
                Key: { eventId },
                ConsistentRead: true,
              })
            );
            if (eventCheck.Item?.startAt && eventCheck.Item.startAt <= now) {
              return { success: false, reason: 'EVENT_STARTED' };
            }
          } catch {
            // fallback
          }
        }
        return { success: false, reason: 'CONCURRENT_PROMOTION_CONFLICT' };
      }
      throw err;
    }
  }

  /**
   * Executes atomic cancellation when waitlist is empty or event has started:
   * 1. Updates cancelled attendee's RSVP to CANCELLED and removes ticketId AND queueKey.
   * 2. Atomically updates cancelling attendee's ACTIVE ticket to CANCELLED in MarqueTickets (enforcing #status = :active).
   * 3. Decrements confirmedCount on MarqueEvents with condition that either waitlistCount is 0/absent OR event has started.
   */
  async cancelConfirmedWithoutWaitlist(
    eventId: string,
    cancelledAttendeeId: string,
    oldTicketId: string
  ): Promise<CancelConfirmedNoWaitlistResult> {
    const now = new Date().toISOString();

    if (!oldTicketId || oldTicketId.trim().length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'oldTicketId is mandatory for confirmed cancellation.');
    }

    const transactItems: any[] = [
      // 0. Update RSVP to CANCELLED and remove both ticketId and queueKey
      {
        Update: {
          TableName: this.rsvpsTable,
          Key: { eventId, attendeeId: cancelledAttendeeId },
          UpdateExpression: 'SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey',
          ConditionExpression: 'attribute_exists(eventId) AND #status = :confirmed',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':cancelled': 'CANCELLED',
            ':confirmed': 'CONFIRMED',
            ':now': now,
          },
        },
      },
      // 1. Mandatory old ticket update: cancelled only if currently ACTIVE
      {
        Update: {
          TableName: this.ticketsTable,
          Key: { ticketId: oldTicketId },
          UpdateExpression: 'SET #status = :cancelled, updatedAt = :now',
          ConditionExpression: 'attribute_exists(ticketId) AND #status = :active',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':cancelled': 'CANCELLED',
            ':active': 'ACTIVE',
            ':now': now,
          },
        },
      },
      // 2. Decrement confirmedCount on MarqueEvents
      {
        Update: {
          TableName: this.eventsTable,
          Key: { eventId },
          UpdateExpression: 'SET confirmedCount = confirmedCount - :dec, updatedAt = :now',
          ConditionExpression:
            'confirmedCount > :zero AND ((attribute_not_exists(waitlistCount) OR waitlistCount = :zero) OR #startAt <= :now)',
          ExpressionAttributeNames: {
            '#startAt': 'startAt',
          },
          ExpressionAttributeValues: {
            ':dec': 1,
            ':zero': 0,
            ':now': now,
          },
        },
      },
    ];

    try {
      await this.getClient().send(
        new TransactWriteCommand({
          TransactItems: transactItems,
        })
      );
      return { success: true };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        err.name === 'TransactionCanceledException'
      ) {
        const reasons = (err as any).CancellationReasons || [];
        // Index 0: RSVP was not confirmed or missing
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'RSVP_NOT_FOUND' };
        }
        // Index 1: Ticket update failed: check ticket
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          try {
            const ticketCheck = await this.getClient().send(
              new GetCommand({
                TableName: this.ticketsTable,
                Key: { ticketId: oldTicketId },
                ConsistentRead: true,
              })
            );
            if (!ticketCheck.Item) {
              return { success: false, reason: 'TICKET_NOT_FOUND' };
            }
            if (ticketCheck.Item.status === 'CHECKED_IN') {
              return { success: false, reason: 'TICKET_ALREADY_CHECKED_IN' };
            }
          } catch {
            // fallback
          }
          return { success: false, reason: 'TICKET_NOT_FOUND' };
        }
        // Index 2: Event update failed (waitlist was not empty and event not started)
        if (reasons[2]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'WAITLIST_NOT_EMPTY' };
        }
      }
      throw err;
    }
  }

  /**
   * Executes atomic waitlisted RSVP cancellation:
   * 1. Updates attendee's RSVP to CANCELLED and removes ticketId AND queueKey.
   * 2. Deletes exact waitlist queue entry from MarqueWaitlist.
   * 3. Decrements waitlistCount on MarqueEvents.
   */
  async cancelWaitlistedRsvp(
    eventId: string,
    attendeeId: string,
    queueKey: string
  ): Promise<CancelWaitlistedResult> {
    const now = new Date().toISOString();

    try {
      await this.getClient().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.rsvpsTable,
                Key: { eventId, attendeeId },
                UpdateExpression: 'SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey',
                ConditionExpression: 'attribute_exists(eventId) AND #status = :waitlisted',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':cancelled': 'CANCELLED',
                  ':waitlisted': 'WAITLISTED',
                  ':now': now,
                },
              },
            },
            {
              Delete: {
                TableName: this.waitlistTable,
                Key: { eventId, queueKey },
                ConditionExpression: 'attribute_exists(eventId) AND attribute_exists(queueKey)',
              },
            },
            {
              Update: {
                TableName: this.eventsTable,
                Key: { eventId },
                UpdateExpression: 'SET waitlistCount = waitlistCount - :dec, updatedAt = :now',
                ConditionExpression: 'waitlistCount > :zero',
                ExpressionAttributeValues: {
                  ':dec': 1,
                  ':zero': 0,
                  ':now': now,
                },
              },
            },
          ],
        })
      );
      return { success: true };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        err.name === 'TransactionCanceledException'
      ) {
        const reasons = (err as any).CancellationReasons || [];
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          return { success: false, reason: 'RSVP_NOT_FOUND' };
        }
        return { success: false, reason: 'CONCURRENT_WAITLIST_CONFLICT' };
      }
      throw err;
    }
  }

  /**
   * Queries registrations for a specific attendee using attendee-index GSI.
   * Handles complete pagination across all pages using LastEvaluatedKey.
   */
  async findRsvpsByAttendee(attendeeId: string): Promise<RsvpItem[]> {
    const items: RsvpItem[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;

    do {
      const queryInput: QueryCommandInput = {
        TableName: this.rsvpsTable,
        IndexName: 'attendee-index',
        KeyConditionExpression: 'attendeeId = :aid',
        ExpressionAttributeValues: {
          ':aid': attendeeId,
        },
        ScanIndexForward: false, // Newest registrations first
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const result = await this.getClient().send(new QueryCommand(queryInput));
      if (result.Items) {
        items.push(...(result.Items as RsvpItem[]));
      }
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return items;
  }


  /**
   * Queries all registrations for a specific event using the base-table eventId partition key.
   * Handles complete pagination across all pages using LastEvaluatedKey.
   */
  async findRsvpsByEvent(eventId: string): Promise<RsvpItem[]> {
    const items: RsvpItem[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined = undefined;

    do {
      const queryInput: QueryCommandInput = {
        TableName: this.rsvpsTable,
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: {
          ':eventId': eventId,
        },
        ScanIndexForward: true,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const result = await this.getClient().send(new QueryCommand(queryInput));

      if (result.Items) {
        items.push(...(result.Items as RsvpItem[]));
      }

      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);

    return items;
  }

}
