import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RsvpRepository } from '../../src/repositories/rsvp.repository.js';
import { resetEnvCache, getEnv } from '../../src/config/env.js';
import type { WaitlistItem, ReserveTicketInput } from '../../src/types/rsvp.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('RsvpRepository Unit Tests (Mocked In-Memory DocumentClient)', () => {
  const testEnv = {
    USERS_TABLE: 'MarqueUsers',
    EVENTS_TABLE: 'MarqueEvents',
    EVENT_STAFF_TABLE: 'MarqueEventStaff',
    RSVPS_TABLE: 'MarqueRSVPs',
    WAITLIST_TABLE: 'MarqueWaitlist',
    TICKETS_TABLE: 'MarqueTickets',
    S3_BUCKET: 'actual-s3-bucket-name',
    JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars-long',
    JWT_EXPIRES_IN: '24h',
  };

  const sampleWaitlistEntry: WaitlistItem = {
    eventId: 'evt-test-1',
    queueKey: '2026-11-01T12:00:00.000Z#usr-waitlist-1',
    attendeeId: 'usr-waitlist-1',
    attendeeName: 'Waitlist User',
    attendeeEmail: 'waitlist@vesit.edu',
    status: 'WAITING',
    createdAt: '2026-11-01T12:00:00.000Z',
  };

  const validTicketInput: ReserveTicketInput = {
    ticketId: 'tkt-1',
    attendeeName: 'Chandrabhanu',
    attendeeEmail: 'chandrabhanu@vesit.edu',
    eventTitle: 'Hackathon',
    eventVenue: 'Lab 502',
    eventStartAt: '2027-11-15T09:00:00.000Z',
  };

  test('findByEventAndAttendee performs strongly consistent read', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return {
          Item: {
            eventId: 'evt-test-1',
            attendeeId: 'usr-1',
            rsvpId: 'rsvp-1',
            status: 'CONFIRMED',
          },
        };
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const result = await repo.findByEventAndAttendee('evt-test-1', 'usr-1');

    assert.equal(result?.rsvpId, 'rsvp-1');
    assert.equal(executedCommand.input.TableName, 'MarqueRSVPs');
    assert.equal(executedCommand.input.ConsistentRead, true);
    assert.equal(executedCommand.input.Key.eventId, 'evt-test-1');
    assert.equal(executedCommand.input.Key.attendeeId, 'usr-1');
  });

  test('reserveConfirmedSeat rejects incomplete ticket input with 400 VALIDATION_ERROR', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const repo = new RsvpRepository({} as any);
    await assert.rejects(
      async () => {
        await repo.reserveConfirmedSeat('evt-test-1', 'usr-1', 'rsvp-1', {
          ticketId: '',
          attendeeName: '',
          attendeeEmail: '',
          eventTitle: '',
          eventVenue: '',
          eventStartAt: '',
        });
      },
      (err: any) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  test('reserveConfirmedSeat executes 3-item transaction creating RSVP and ACTIVE ticket with startAt condition', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.reserveConfirmedSeat('evt-test-1', 'usr-1', 'rsvp-1', validTicketInput);

    assert.equal(res.success, true);
    assert.equal(executedCommand.input.TransactItems.length, 3);

    // Item 0: MarqueEvents Update (includes #startAt > :now)
    const eventUpdate = executedCommand.input.TransactItems[0].Update;
    assert.equal(eventUpdate.TableName, 'MarqueEvents');
    assert.match(eventUpdate.UpdateExpression, /confirmedCount = confirmedCount \+ :inc/);
    assert.match(
      eventUpdate.ConditionExpression,
      /#status = :published AND confirmedCount < #capacity AND #startAt > :now/
    );

    // Item 1: MarqueRSVPs Put
    const rsvpPut = executedCommand.input.TransactItems[1].Put;
    assert.equal(rsvpPut.TableName, 'MarqueRSVPs');
    assert.equal(rsvpPut.Item.status, 'CONFIRMED');
    assert.equal(rsvpPut.Item.ticketId, 'tkt-1');
    assert.match(rsvpPut.ConditionExpression, /attribute_not_exists\(attendeeId\) OR #status = :cancelled/);

    // Item 2: MarqueTickets Put (ACTIVE ticket with all required attributes)
    const ticketPut = executedCommand.input.TransactItems[2].Put;
    assert.equal(ticketPut.TableName, 'MarqueTickets');
    assert.equal(ticketPut.Item.ticketId, 'tkt-1');
    assert.equal(ticketPut.Item.status, 'ACTIVE');
    assert.equal(ticketPut.Item.eventTitle, 'Hackathon');
    assert.match(ticketPut.ConditionExpression, /attribute_not_exists\(ticketId\)/);
  });

  test('reserveConfirmedSeat maps duplicate registration condition failure', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async () => {
        const error: any = new Error('Transaction cancelled');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' }, // Index 1: RSVP Put
          { Code: 'None' },
        ];
        throw error;
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.reserveConfirmedSeat('evt-test-1', 'usr-1', 'rsvp-1', validTicketInput);

    assert.equal(res.success, false);
    assert.equal(res.reason, 'DUPLICATE_REGISTRATION');
  });

  test('reserveConfirmedSeat maps REGISTRATION_CLOSED when event started before transaction execution', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async (cmd: any) => {
        if (cmd.input?.Key?.eventId) {
          return {
            Item: {
              eventId: 'evt-test-1',
              status: 'PUBLISHED',
              startAt: '2020-01-01T00:00:00.000Z',
              capacity: 100,
              confirmedCount: 50,
            },
          };
        }
        const error: any = new Error('Transaction cancelled');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [
          { Code: 'ConditionalCheckFailed' },
          { Code: 'None' },
          { Code: 'None' },
        ];
        throw error;
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.reserveConfirmedSeat('evt-test-1', 'usr-1', 'rsvp-1', validTicketInput);

    assert.equal(res.success, false);
    assert.equal(res.reason, 'REGISTRATION_CLOSED');
  });

  test('getWaitlistPosition returns 1 for first attendee in queue', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async () => ({ Count: 1 }),
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const pos = await repo.getWaitlistPosition('evt-test-1', '2026-11-01T12:00:00.000Z#usr-1');

    assert.equal(pos, 1);
  });

  test('getWaitlistPosition returns 4 for fourth attendee in queue', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async () => ({ Count: 4 }),
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const pos = await repo.getWaitlistPosition('evt-test-1', '2026-11-01T12:05:00.000Z#usr-4');

    assert.equal(pos, 4);
  });

  test('getWaitlistPosition queries with queueKey <= :queueKey so later entries do not affect earlier position', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return { Count: 2 };
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const targetQueueKey = '2026-11-01T12:02:00.000Z#usr-2';
    const pos = await repo.getWaitlistPosition('evt-test-1', targetQueueKey);

    assert.equal(pos, 2);
    assert.equal(executedCommand.input.TableName, 'MarqueWaitlist');
    assert.equal(
      executedCommand.input.KeyConditionExpression,
      'eventId = :eventId AND queueKey <= :queueKey'
    );
    assert.equal(
      executedCommand.input.ExpressionAttributeValues[':queueKey'],
      targetQueueKey
    );
    assert.equal(executedCommand.input.Select, 'COUNT');
    assert.equal(executedCommand.input.ConsistentRead, true);
  });

  test('getWaitlistPosition correctly sums counts across paginated DynamoDB responses', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const executedCommands: any[] = [];
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommands.push(cmd);
        if (executedCommands.length === 1) {
          return {
            Count: 30,
            LastEvaluatedKey: { eventId: 'evt-test-1', queueKey: 'key-page-1' },
          };
        }
        return {
          Count: 15,
        };
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const pos = await repo.getWaitlistPosition('evt-test-1', '2026-11-01T12:45:00.000Z#usr-45');

    assert.equal(pos, 45); // 30 + 15
    assert.equal(executedCommands.length, 2);
    assert.deepEqual(executedCommands[1].input.ExclusiveStartKey, {
      eventId: 'evt-test-1',
      queueKey: 'key-page-1',
    });
  });

  test('getWaitlistPosition throws explicit WAITLIST_POSITION_ERROR on impossible zero count result', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async () => ({ Count: 0 }),
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    await assert.rejects(
      async () => {
        await repo.getWaitlistPosition('evt-test-1', '2026-11-01T12:00:00.000Z#usr-1');
      },
      (err: any) => {
        assert.equal(err.code, 'WAITLIST_POSITION_ERROR');
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
  });

  test('promoteWaitlistEntry rejects missing or blank oldTicketId with 400 VALIDATION_ERROR', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const repo = new RsvpRepository({} as any);
    await assert.rejects(
      async () => {
        await repo.promoteWaitlistEntry(
          'evt-test-1',
          'usr-cancelling',
          '   ',
          sampleWaitlistEntry,
          'tkt-promoted-1',
          {
            eventTitle: 'Hackathon',
            eventVenue: 'Lab 502',
            eventStartAt: '2027-11-15T09:00:00.000Z',
          }
        );
      },
      (err: any) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  test('cancelConfirmedWithoutWaitlist rejects missing or blank oldTicketId with 400 VALIDATION_ERROR', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const repo = new RsvpRepository({} as any);
    await assert.rejects(
      async () => {
        await repo.cancelConfirmedWithoutWaitlist('evt-test-1', 'usr-cancelling', '');
      },
      (err: any) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  test('promoteWaitlistEntry removes ticketId and queueKey from cancelled RSVP and checks ticket ACTIVE condition', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.promoteWaitlistEntry(
      'evt-test-1',
      'usr-cancelling',
      'tkt-old-1',
      sampleWaitlistEntry,
      'tkt-promoted-1',
      {
        eventTitle: 'Hackathon 2026',
        eventVenue: 'Campus Auditorium',
        eventStartAt: '2027-11-15T09:00:00.000Z',
      }
    );

    assert.equal(res.success, true);
    assert.equal(executedCommand.input.TransactItems.length, 6);

    // Item 0: Cancelled RSVP removes ticketId AND queueKey
    const cancelUpdate = executedCommand.input.TransactItems[0].Update;
    assert.equal(cancelUpdate.TableName, 'MarqueRSVPs');
    assert.match(
      cancelUpdate.UpdateExpression,
      /SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey/
    );

    // Item 1: Old ticket cancelled only if currently ACTIVE
    const ticketCancel = executedCommand.input.TransactItems[1].Update;
    assert.equal(ticketCancel.TableName, 'MarqueTickets');
    assert.match(ticketCancel.ConditionExpression, /attribute_exists\(ticketId\) AND #status = :active/);

    // Item 5: Event update checks #startAt > :now
    const eventUpdate = executedCommand.input.TransactItems[5].Update;
    assert.match(eventUpdate.ConditionExpression, /waitlistCount > :zero AND #startAt > :now/);
  });

  test('promoteWaitlistEntry returns TICKET_ALREADY_CHECKED_IN when cancelling ticket was checked in', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async (cmd: any) => {
        if (cmd.input?.Key?.ticketId) {
          return {
            Item: {
              ticketId: 'tkt-old-1',
              status: 'CHECKED_IN',
            },
          };
        }
        const error: any = new Error('Transaction cancelled');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' }, // ticket condition failed (#status = :active)
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'None' },
        ];
        throw error;
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.promoteWaitlistEntry(
      'evt-test-1',
      'usr-cancelling',
      'tkt-old-1',
      sampleWaitlistEntry,
      'tkt-promoted-1',
      {
        eventTitle: 'Hackathon 2026',
        eventVenue: 'Campus Auditorium',
        eventStartAt: '2027-11-15T09:00:00.000Z',
      }
    );

    assert.equal(res.success, false);
    assert.equal(res.reason, 'TICKET_ALREADY_CHECKED_IN');
  });

  test('promoteWaitlistEntry returns TICKET_NOT_FOUND (not RSVP_NOT_FOUND) when ticket record is missing', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async (cmd: any) => {
        if (cmd.input?.Key?.ticketId) {
          // Ticket not in MarqueTickets (legacy PR #8 record)
          return {};
        }
        const error: any = new Error('Transaction cancelled');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' }, // ticket condition failed
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'None' },
        ];
        throw error;
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.promoteWaitlistEntry(
      'evt-test-1',
      'usr-cancelling',
      'tkt-old-1',
      sampleWaitlistEntry,
      'tkt-promoted-1',
      {
        eventTitle: 'Hackathon 2026',
        eventVenue: 'Campus Auditorium',
        eventStartAt: '2027-11-15T09:00:00.000Z',
      }
    );

    assert.equal(res.success, false);
    assert.equal(res.reason, 'TICKET_NOT_FOUND');
    assert.notEqual(res.reason, 'RSVP_NOT_FOUND');
  });

  test('cancelConfirmedWithoutWaitlist removes ticketId and queueKey, and checks ticket ACTIVE condition', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.cancelConfirmedWithoutWaitlist('evt-test-1', 'usr-cancelling', 'tkt-1');

    assert.equal(res.success, true);
    assert.equal(executedCommand.input.TransactItems.length, 3);

    // Item 0: Update RSVP to CANCELLED and remove both ticketId and queueKey
    const rsvpUpdate = executedCommand.input.TransactItems[0].Update;
    assert.equal(rsvpUpdate.TableName, 'MarqueRSVPs');
    assert.match(
      rsvpUpdate.UpdateExpression,
      /SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey/
    );

    // Item 1: Update Ticket only if ACTIVE
    const ticketUpdate = executedCommand.input.TransactItems[1].Update;
    assert.equal(ticketUpdate.TableName, 'MarqueTickets');
    assert.match(ticketUpdate.ConditionExpression, /attribute_exists\(ticketId\) AND #status = :active/);

    // Item 2: Decrement confirmedCount on MarqueEvents, allowing cancellation after event has started
    const eventUpdate = executedCommand.input.TransactItems[2].Update;
    assert.match(
      eventUpdate.ConditionExpression,
      /confirmedCount > :zero AND \(\(attribute_not_exists\(waitlistCount\) OR waitlistCount = :zero\) OR #startAt <= :now\)/
    );
  });

  test('cancelConfirmedWithoutWaitlist returns TICKET_ALREADY_CHECKED_IN on checked in ticket', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockDocClient = {
      send: async (cmd: any) => {
        if (cmd.input?.Key?.ticketId) {
          return {
            Item: {
              ticketId: 'tkt-1',
              status: 'CHECKED_IN',
            },
          };
        }
        const error: any = new Error('Transaction cancelled');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' }, // ticket condition failed
          { Code: 'None' },
        ];
        throw error;
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.cancelConfirmedWithoutWaitlist('evt-test-1', 'usr-cancelling', 'tkt-1');

    assert.equal(res.success, false);
    assert.equal(res.reason, 'TICKET_ALREADY_CHECKED_IN');
  });

  test('cancelWaitlistedRsvp removes ticketId and queueKey from CANCELLED RSVP and deletes queue entry', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let executedCommand: any = null;
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommand = cmd;
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const res = await repo.cancelWaitlistedRsvp('evt-test-1', 'usr-1', '2026-11-01T12:00:00.000Z#usr-1');

    assert.equal(res.success, true);
    assert.equal(executedCommand.input.TransactItems.length, 3);

    // Item 0: Update WAITLISTED RSVP to CANCELLED and remove ticketId and queueKey
    const rsvpUpdate = executedCommand.input.TransactItems[0].Update;
    assert.equal(rsvpUpdate.TableName, 'MarqueRSVPs');
    assert.match(
      rsvpUpdate.UpdateExpression,
      /SET #status = :cancelled, updatedAt = :now REMOVE ticketId, queueKey/
    );

    // Item 1: Delete from MarqueWaitlist
    const wlDelete = executedCommand.input.TransactItems[1].Delete;
    assert.equal(wlDelete.TableName, 'MarqueWaitlist');
    assert.equal(wlDelete.Key.queueKey, '2026-11-01T12:00:00.000Z#usr-1');

    // Item 2: Decrement waitlistCount
    const eventUpdate = executedCommand.input.TransactItems[2].Update;
    assert.equal(eventUpdate.TableName, 'MarqueEvents');
    assert.match(eventUpdate.ConditionExpression, /waitlistCount > :zero/);
  });

  test('findRsvpsByAttendee queries attendee-index GSI and paginates across multiple pages using LastEvaluatedKey', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const executedCommands: any[] = [];
    const mockDocClient = {
      send: async (cmd: any) => {
        executedCommands.push(cmd);
        if (executedCommands.length === 1) {
          return {
            Items: [
              { eventId: 'evt-1', attendeeId: 'usr-1', status: 'CONFIRMED' },
              { eventId: 'evt-2', attendeeId: 'usr-1', status: 'WAITLISTED' },
            ],
            LastEvaluatedKey: { eventId: 'evt-2', attendeeId: 'usr-1' },
          };
        }
        return {
          Items: [{ eventId: 'evt-3', attendeeId: 'usr-1', status: 'CANCELLED' }],
        };
      },
    } as unknown as DynamoDBDocumentClient;

    const repo = new RsvpRepository(mockDocClient);
    const results = await repo.findRsvpsByAttendee('usr-1');

    assert.equal(results.length, 3);
    assert.equal(executedCommands.length, 2);

    // Verify first query on attendee-index GSI
    assert.equal(executedCommands[0].input.TableName, 'MarqueRSVPs');
    assert.equal(executedCommands[0].input.IndexName, 'attendee-index');
    assert.equal(executedCommands[0].input.KeyConditionExpression, 'attendeeId = :aid');
    assert.equal(executedCommands[0].input.ExpressionAttributeValues[':aid'], 'usr-1');
    assert.equal(executedCommands[0].input.ScanIndexForward, false);
    assert.equal(executedCommands[0].input.ExclusiveStartKey, undefined);

    // Verify second query passed LastEvaluatedKey as ExclusiveStartKey
    assert.deepEqual(executedCommands[1].input.ExclusiveStartKey, {
      eventId: 'evt-2',
      attendeeId: 'usr-1',
    });
  });
});
