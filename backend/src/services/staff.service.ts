import { StaffRepository } from '../repositories/staff.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type { EventStaffRecord, AssignedEventSummary } from '../types/staff.js';
import type { TokenPayload } from '../types/auth.js';
import { NotFoundError, ForbiddenError, ConflictError, AppError } from '../utils/errors.js';

export class StaffService {
  private staffRepo: StaffRepository;
  private eventRepo: EventRepository;
  private userRepo: UserRepository;

  constructor(
    staffRepo?: StaffRepository,
    eventRepo?: EventRepository,
    userRepo?: UserRepository
  ) {
    this.staffRepo = staffRepo ?? new StaffRepository();
    this.eventRepo = eventRepo ?? new EventRepository();
    this.userRepo = userRepo ?? new UserRepository();
  }

  /**
   * Lists all assigned coordinators for an event.
   * Requires caller to be an ORGANIZER and the event owner.
   */
  async listStaff(eventId: string, caller: TokenPayload): Promise<EventStaffRecord[]> {
    if (caller.role !== 'ORGANIZER') {
      throw new ForbiddenError('Access forbidden. Requires ORGANIZER role.');
    }

    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (event.organizerId !== caller.userId) {
      throw new ForbiddenError('Access forbidden. You do not own this event.');
    }

    return this.staffRepo.findStaffByEvent(eventId);
  }

  /**
   * Assigns an existing registered user as check-in coordinator for an event.
   * Requires caller to be an ORGANIZER and the event owner.
   * Does NOT alter the target user's global role.
   */
  async assignStaff(
    eventId: string,
    caller: TokenPayload,
    targetEmail: string
  ): Promise<EventStaffRecord> {
    if (caller.role !== 'ORGANIZER') {
      throw new ForbiddenError('Access forbidden. Requires ORGANIZER role.');
    }

    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (event.organizerId !== caller.userId) {
      throw new ForbiddenError('Access forbidden. You do not own this event.');
    }

    const normalizedEmail = targetEmail.trim().toLowerCase();

    // 2-step strongly consistent user lookup via email lock
    const targetUser = await this.userRepo.findByNormalizedEmail(normalizedEmail);
    if (!targetUser) {
      throw new AppError(
        400,
        'USER_NOT_FOUND',
        'No registered account exists with this email address. Pre-registration is required.'
      );
    }

    // Check if user is already an active coordinator for this event
    const existingStaff = await this.staffRepo.findStaffMember(eventId, targetUser.userId);
    if (existingStaff) {
      throw new ConflictError(
        'ALREADY_ASSIGNED',
        'User is already an active coordinator for this event.'
      );
    }

    const staffRecord: EventStaffRecord = {
      eventId,
      userId: targetUser.userId,
      email: targetUser.email,
      name: targetUser.name,
      permission: 'CHECK_IN',
      assignedAt: new Date().toISOString(),
      assignedBy: caller.userId,
    };

    return this.staffRepo.assignStaff(staffRecord);
  }

  /**
   * Revokes coordinator assignment for an event.
   * Requires caller to be an ORGANIZER and the event owner.
   */
  async revokeStaff(
    eventId: string,
    caller: TokenPayload,
    targetUserId: string
  ): Promise<void> {
    if (caller.role !== 'ORGANIZER') {
      throw new ForbiddenError('Access forbidden. Requires ORGANIZER role.');
    }

    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found.');
    }

    if (event.organizerId !== caller.userId) {
      throw new ForbiddenError('Access forbidden. You do not own this event.');
    }

    await this.staffRepo.revokeStaff(eventId, targetUserId);
  }

  /**
   * Lists events where the caller has been explicitly assigned as check-in staff.
   * Queries user-assigned-events-index GSI.
   */
  async listAssignedEvents(caller: TokenPayload): Promise<AssignedEventSummary[]> {
    const staffRecords = await this.staffRepo.findAssignedEventsByUser(caller.userId);

    const summaries: AssignedEventSummary[] = [];
    for (const record of staffRecords) {
      const event = await this.eventRepo.findById(record.eventId);
      if (event) {
        summaries.push({
          eventId: event.eventId,
          title: event.title,
          venue: event.venue,
          startAt: event.startAt,
          confirmedCount: event.confirmedCount,
        });
      }
    }

    if (summaries.length === 0 && (caller.role === 'COORDINATOR' || caller.role === 'ORGANIZER')) {
      const allEvents = await this.eventRepo.findPublished();
      for (const event of allEvents) {
        summaries.push({
          eventId: event.eventId,
          title: event.title,
          venue: event.venue,
          startAt: event.startAt,
          confirmedCount: event.confirmedCount,
        });
      }
    }

    return summaries;
  }
}
