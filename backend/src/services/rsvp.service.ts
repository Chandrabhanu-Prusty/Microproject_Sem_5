import { randomUUID } from 'node:crypto';
import { RsvpRepository } from '../repositories/rsvp.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { TokenPayload } from '../types/auth.js';
import { StaffRepository } from '../repositories/staff.repository.js';
import type {
  RsvpResult,
  CancelRsvpResult,
  UserRsvpSummary,
} from '../types/rsvp.js';
import { NotFoundError, ConflictError, AppError, ForbiddenError } from '../utils/errors.js';
export class RsvpService {
  constructor(
    private rsvpRepo: RsvpRepository = new RsvpRepository(),
    private eventRepo: EventRepository = new EventRepository(),
    private userRepo: UserRepository = new UserRepository(),
    private staffRepo: StaffRepository = new StaffRepository()
  ) {}

  /**
   * Registers an RSVP or enters FIFO waitlist for an event.
   * Atomically protects capacity invariants, prevents duplicate registrations,
   * enforces event time eligibility inside transactions, and uses exact FIFO position query.
   */
  async rsvpEvent(eventId: string, caller: TokenPayload): Promise<RsvpResult> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (event.status !== 'PUBLISHED') {
      throw new AppError(400, 'EVENT_NOT_PUBLISHED', 'Event is not open for registration.');
    }

    if (event.startAt && new Date(event.startAt).getTime() < Date.now()) {
      throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration for this event is closed.');
    }

    // Check duplicate active registration for caller (CANCELLED RSVPs are ignored, allowing re-registration)
    const existingRsvp = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
    if (existingRsvp && (existingRsvp.status === 'CONFIRMED' || existingRsvp.status === 'WAITLISTED')) {
      throw new ConflictError('DUPLICATE_REGISTRATION', 'You have already registered for this event.');
    }

    // Lookup user display name for waitlist record & ticket
    let userName: string = caller.email.split('@')[0] || 'Attendee';
    try {
      const userProfile = await this.userRepo.findById(caller.userId);
      if (userProfile?.name && userProfile.name.trim().length > 0) {
        userName = userProfile.name.trim();
      }
    } catch {
      // Fallback
    }

    // Reservation execution with bounded retries for concurrency contention
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentEvent = attempt === 0 ? event : await this.eventRepo.findById(eventId);
      if (!currentEvent || currentEvent.status !== 'PUBLISHED') {
        throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration for this event is closed.');
      }

      if (currentEvent.startAt && new Date(currentEvent.startAt).getTime() < Date.now()) {
        throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration for this event is closed.');
      }

      if (currentEvent.confirmedCount < currentEvent.capacity) {
        // Path A: Seat available -> attempt atomic confirmed seat reservation
        const rsvpId = `rsvp-${randomUUID()}`;
        const ticketId = `tkt-${randomUUID().replace(/-/g, '').slice(0, 16)}`;

        const res = await this.rsvpRepo.reserveConfirmedSeat(
          eventId,
          caller.userId,
          rsvpId,
          {
            ticketId,
            attendeeName: userName,
            attendeeEmail: caller.email,
            eventTitle: currentEvent.title,
            eventVenue: currentEvent.venue,
            eventStartAt: currentEvent.startAt,
          }
        );

        if (res.success) {
          return {
            status: 'CONFIRMED',
            rsvpId,
            ticketId,
            message: 'Registration confirmed. Your digital pass is available.',
          };
        }

        if (res.reason === 'DUPLICATE_REGISTRATION') {
          throw new ConflictError('DUPLICATE_REGISTRATION', 'You have already registered for this event.');
        }

        if (res.reason === 'REGISTRATION_CLOSED' || res.reason === 'EVENT_NOT_PUBLISHED') {
          throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration for this event is closed.');
        }

        if (res.reason === 'EVENT_FULL') {
          // Final seat was taken concurrently; proceed immediately to waitlist path
          continue;
        }
      } else {
        // Path B: Capacity exhausted -> attempt atomic waitlist registration
        const rsvpId = `rsvp-${randomUUID()}`;
        const now = new Date().toISOString();
        const queueKey = `${now}#${caller.userId}`;

        const res = await this.rsvpRepo.joinWaitlist(
          eventId,
          caller.userId,
          rsvpId,
          queueKey,
          userName,
          caller.email
        );

        if (res.success) {
          // Calculate exact FIFO position using base-table query with sort key condition (queueKey <= :queueKey)
          const queuePosition = await this.rsvpRepo.getWaitlistPosition(eventId, queueKey);
          return {
            status: 'WAITLISTED',
            rsvpId,
            queuePosition,
            queueKey,
            message: 'Event is currently full. You have been placed in the FIFO waitlist.',
          };
        }

        if (res.reason === 'DUPLICATE_REGISTRATION') {
          throw new ConflictError('DUPLICATE_REGISTRATION', 'You have already registered for this event.');
        }

        if (res.reason === 'REGISTRATION_CLOSED' || res.reason === 'EVENT_NOT_PUBLISHED') {
          throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration for this event is closed.');
        }

        if (res.reason === 'SEAT_AVAILABLE') {
          // A seat became available concurrently; retry confirmed reservation path
          continue;
        }
      }
    }

    throw new AppError(
      409,
      'CONCURRENT_UPDATE_CONFLICT',
      'Could not complete registration due to high contention. Please try again.'
    );
  }

  /**
   * Cancels caller's active registration.
   * If CONFIRMED:
   * - Enforces non-empty ticketId before cancellation or promotion; returns 409 TICKET_RECORD_MISSING if missing.
   * - Retrieves event metadata; throws 404 EVENT_NOT_FOUND if event lookup fails.
   * - If event has started: does NOT promote waitlisted attendees; decrements confirmedCount and cancels ticket.
   * - If event has not started and waitlist exists: atomically promotes oldest candidate and cancels old ticket.
   * - If event has not started and waitlist empty: decrements confirmedCount and cancels old ticket.
   * If WAITLISTED:
   * - Atomically deletes waitlist queue entry and sets RSVP status to CANCELLED.
   * - Seamlessly resolves race condition where waitlisted attendee was concurrently promoted.
   */
  async cancelRsvp(eventId: string, caller: TokenPayload): Promise<CancelRsvpResult> {
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existingRsvp = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
      if (!existingRsvp || (existingRsvp.status !== 'CONFIRMED' && existingRsvp.status !== 'WAITLISTED')) {
        throw new NotFoundError('RSVP_NOT_FOUND', 'Active registration not found for this event.');
      }

      // Branch A: Waitlisted attendee cancellation
      if (existingRsvp.status === 'WAITLISTED') {
        const queueKey = existingRsvp.queueKey || `${existingRsvp.createdAt}#${caller.userId}`;
        const res = await this.rsvpRepo.cancelWaitlistedRsvp(eventId, caller.userId, queueKey);

        if (res.success) {
          return {
            message: 'Registration successfully cancelled.',
            promotedAttendee: null,
          };
        }

        // If cancellation failed, strongly re-read state to detect race with concurrent promotion
        const refreshed = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
        if (refreshed?.status === 'CONFIRMED') {
          // Attendee was promoted to CONFIRMED concurrently! Next iteration will execute confirmed cancellation.
          continue;
        }

        if (!refreshed || refreshed.status === 'CANCELLED') {
          throw new NotFoundError('RSVP_NOT_FOUND', 'Active registration not found for this event.');
        }

        // Transient conflict; retry
        continue;
      }

      // Branch B: Confirmed attendee cancellation
      // A CONFIRMED RSVP must have a non-empty ticketId before cancellation or promotion
      if (!existingRsvp.ticketId || existingRsvp.ticketId.trim().length === 0) {
        throw new ConflictError(
          'TICKET_RECORD_MISSING',
          'Confirmed registration is missing ticket identifier.'
        );
      }
      const ticketId = existingRsvp.ticketId.trim();

      // Retrieve event details strictly; do not swallow errors or use fake defaults
      const event = await this.eventRepo.findById(eventId);
      if (!event) {
        throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
      }

      const isEventStarted = event.startAt && new Date(event.startAt).getTime() <= Date.now();

      // Rule 5: A cancellation after event.startAt must NOT issue a new ACTIVE ticket to a waitlisted attendee
      if (isEventStarted) {
        const cancelRes = await this.rsvpRepo.cancelConfirmedWithoutWaitlist(
          eventId,
          caller.userId,
          ticketId
        );

        if (cancelRes.success) {
          return {
            message: 'Registration successfully cancelled.',
            promotedAttendee: null,
          };
        }

        if (cancelRes.reason === 'TICKET_ALREADY_CHECKED_IN') {
          throw new ConflictError(
            'CANNOT_CANCEL_CHECKED_IN',
            'Cannot cancel registration because ticket has already been checked in.'
          );
        }

        if (cancelRes.reason === 'TICKET_NOT_FOUND') {
          throw new ConflictError(
            'TICKET_RECORD_MISSING',
            'Associated ticket record was not found in ticket store.'
          );
        }

        if (cancelRes.reason === 'RSVP_NOT_FOUND') {
          const checkRsvp = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
          if (!checkRsvp || checkRsvp.status !== 'CONFIRMED') {
            throw new NotFoundError('RSVP_NOT_FOUND', 'Active registration not found for this event.');
          }
        }

        continue;
      }

      // Event has not started: inspect waitlist for promotion
      const oldestCandidate = await this.rsvpRepo.getOldestWaitlistEntry(eventId);

      if (oldestCandidate) {
        const newTicketId = `tkt-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const promoRes = await this.rsvpRepo.promoteWaitlistEntry(
          eventId,
          caller.userId,
          ticketId,
          oldestCandidate,
          newTicketId,
          {
            eventTitle: event.title,
            eventVenue: event.venue,
            eventStartAt: event.startAt,
          }
        );

        if (promoRes.success) {
          const displayName =
            oldestCandidate.attendeeName && oldestCandidate.attendeeName.trim().length > 0
              ? oldestCandidate.attendeeName.trim()
              : 'Waitlisted Attendee';

          return {
            message: 'Registration successfully cancelled.',
            promotedAttendee: displayName,
          };
        }

        if (promoRes.reason === 'TICKET_ALREADY_CHECKED_IN') {
          throw new ConflictError(
            'CANNOT_CANCEL_CHECKED_IN',
            'Cannot cancel registration because ticket has already been checked in.'
          );
        }

        if (promoRes.reason === 'TICKET_NOT_FOUND') {
          throw new ConflictError(
            'TICKET_RECORD_MISSING',
            'Associated ticket record was not found in ticket store.'
          );
        }

        if (promoRes.reason === 'EVENT_STARTED') {
          // Event started during promotion contention; next iteration will execute post-event cancellation
          continue;
        }

        if (promoRes.reason === 'RSVP_NOT_FOUND') {
          const checkRsvp = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
          if (!checkRsvp || checkRsvp.status !== 'CONFIRMED') {
            throw new NotFoundError('RSVP_NOT_FOUND', 'Active registration not found for this event.');
          }
        }

        // Concurrent promotion conflict; retry loop
        continue;
      } else {
        // Waitlist is empty -> decrement confirmedCount
        const cancelRes = await this.rsvpRepo.cancelConfirmedWithoutWaitlist(
          eventId,
          caller.userId,
          ticketId
        );

        if (cancelRes.success) {
          return {
            message: 'Registration successfully cancelled.',
            promotedAttendee: null,
          };
        }

        if (cancelRes.reason === 'TICKET_ALREADY_CHECKED_IN') {
          throw new ConflictError(
            'CANNOT_CANCEL_CHECKED_IN',
            'Cannot cancel registration because ticket has already been checked in.'
          );
        }

        if (cancelRes.reason === 'TICKET_NOT_FOUND') {
          throw new ConflictError(
            'TICKET_RECORD_MISSING',
            'Associated ticket record was not found in ticket store.'
          );
        }

        if (cancelRes.reason === 'RSVP_NOT_FOUND') {
          const checkRsvp = await this.rsvpRepo.findByEventAndAttendee(eventId, caller.userId);
          if (!checkRsvp || checkRsvp.status !== 'CONFIRMED') {
            throw new NotFoundError('RSVP_NOT_FOUND', 'Active registration not found for this event.');
          }
        }

        if (cancelRes.reason === 'WAITLIST_NOT_EMPTY') {
          // A concurrent waitlist entry arrived while we inspected; retry promotion branch
          continue;
        }
      }
    }

    throw new AppError(
      409,
      'CONCURRENT_UPDATE_CONFLICT',
      'Could not complete cancellation due to high contention. Please try again.'
    );
  }

  /**
   * Retrieves all active registrations for caller using attendee-index GSI.
   * Excludes cancelled registrations and enriches active items with current event details.
   */
  async getMyRsvps(caller: TokenPayload): Promise<UserRsvpSummary[]> {
    const rsvps = await this.rsvpRepo.findRsvpsByAttendee(caller.userId);
    const activeRsvps = rsvps.filter((r) => r.status !== 'CANCELLED');

    // Fetch and enrich event summaries
    const eventCache = new Map<string, { title: string; venue: string; startAt: string }>();

    const enriched = await Promise.all(
      activeRsvps.map(async (rsvp) => {
        let eventSummary = eventCache.get(rsvp.eventId);
        if (!eventSummary) {
          try {
            const event = await this.eventRepo.findById(rsvp.eventId);
            if (event) {
              eventSummary = {
                title: event.title,
                venue: event.venue,
                startAt: event.startAt,
              };
              eventCache.set(rsvp.eventId, eventSummary);
            }
          } catch {
            // Event fetch fallback
          }
        }

        return {
          rsvpId: rsvp.rsvpId,
          eventId: rsvp.eventId,
          status: rsvp.status,
          ticketId: rsvp.ticketId,
          queueKey: rsvp.queueKey ?? null,
          createdAt: rsvp.createdAt,
          event: eventSummary ?? {
            title: 'Campus Event',
            venue: 'Campus Venue',
            startAt: rsvp.createdAt,
          },
        };
      })
    );

    return enriched;
  }


  /**
   * Retrieves active attendees for an event.
   * Only the event owner can access this list.
   */
  async getEventAttendees(
    eventId: string,
    caller: TokenPayload,
    query = ''
  ): Promise<Array<{
    ticketId: string;
    attendeeName: string;
    attendeeEmail: string;
    status: string;
  }>> {
    const event = await this.eventRepo.findById(eventId);

    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (event.organizerId !== caller.userId) {
      throw new ForbiddenError('Access forbidden. You do not own this event.');
    }

    const rsvps = await this.rsvpRepo.findRsvpsByEvent(eventId);
    const activeRsvps = rsvps.filter(
      (r) => r.status === 'CONFIRMED' || r.status === 'WAITLISTED'
    );

    const search = query.trim().toLowerCase();

    const attendees = await Promise.all(
      activeRsvps.map(async (rsvp) => {
        const profile = await this.userRepo.findById(rsvp.attendeeId);

        return {
          ticketId: rsvp.ticketId || rsvp.rsvpId,
          attendeeName: profile?.name || 'Attendee',
          attendeeEmail: profile?.email || '',
          status: rsvp.status,
        };
      })
    );

    return search
      ? attendees.filter(
          (a) =>
            a.attendeeName.toLowerCase().includes(search) ||
            a.attendeeEmail.toLowerCase().includes(search)
        )
      : attendees;
  }
    /**
   * Checks in an attendee's ticket.
   * Only the event owner can check in tickets for that event.
   */
    /**
   * Checks in a ticket. Caller must be explicitly assigned to the event.
   */
  async checkInTicket(
    eventId: string,
    ticketId: string,
    caller: TokenPayload
  ) {
    const event = await this.eventRepo.findById(eventId);

    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    const assignment = await this.staffRepo.findStaffMember(
      eventId,
      caller.userId
    );

    if (!assignment || assignment.permission !== 'CHECK_IN') {
      throw new ForbiddenError(
        'You are not assigned as check-in staff for this event.'
      );
    }

    let checkedInBy = caller.email.split('@')[0] || 'Coordinator';

    try {
      const profile = await this.userRepo.findById(caller.userId);
      if (profile?.name?.trim()) {
        checkedInBy = profile.name.trim();
      }
    } catch {
      // Use email-based fallback.
    }

    const result = await this.rsvpRepo.checkInTicket(
      eventId,
      ticketId,
      checkedInBy
    );

    if (!result.success) {
      if (result.reason === 'TICKET_NOT_FOUND') {
        throw new NotFoundError('TICKET_NOT_FOUND', 'Ticket not found.');
      }

      if (result.reason === 'TICKET_EVENT_MISMATCH') {
        throw new AppError(
          400,
          'TICKET_EVENT_MISMATCH',
          'This ticket does not belong to the selected event.'
        );
      }

      if (result.reason === 'TICKET_ALREADY_CHECKED_IN') {
        throw new AppError(
          409,
          'TICKET_ALREADY_CHECKED_IN',
          'This ticket has already been checked in.'
        );
      }

      throw new AppError(
        409,
        'TICKET_NOT_ACTIVE',
        'This ticket is not active and cannot be checked in.'
      );
    }

    const ticket = result.ticket ?? {};

    return {
      status: 'CHECKED_IN',
      ticketId: String(ticket.ticketId ?? ticketId),
      attendeeName: String(ticket.attendeeName ?? ''),
      attendeeEmail: String(ticket.attendeeEmail ?? ''),
      checkedInAt: String(ticket.checkedInAt ?? new Date().toISOString()),
      checkedInBy: String(ticket.checkedInBy ?? checkedInBy),
    };
  }

  /**
   * Returns attendance statistics. Only the event's organizer can view them.
   */
  async getEventStats(eventId: string, caller: TokenPayload) {
    const event = await this.eventRepo.findById(eventId);

    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (caller.role !== 'ORGANIZER' || event.organizerId !== caller.userId) {
      throw new ForbiddenError(
        'Only the event organizer can view these statistics.'
      );
    }

    const [tickets, waitlistCount] = await Promise.all([
      this.rsvpRepo.findTicketsByEvent(eventId),
      this.rsvpRepo.getWaitlistCount(eventId),
    ]);

    const checkedInCount = tickets.filter(
      (ticket) => ticket.status === 'CHECKED_IN'
    ).length;

    const confirmedCount = event.confirmedCount ?? 0;

    return {
      capacity: event.capacity,
      confirmedCount,
      waitlistCount,
      checkedInCount,
      attendancePercentage:
        confirmedCount > 0
          ? Math.round((checkedInCount / confirmedCount) * 100)
          : 0,
    };
  }
}
