import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { RsvpService } from '../services/rsvp.service.js';
import { jsonResponse, errorResponse } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import type { AuthService } from '../services/auth.service.js';

let defaultRsvpService: RsvpService | null = null;

function getDefaultRsvpService(): RsvpService {
  if (!defaultRsvpService) {
    defaultRsvpService = new RsvpService();
  }
  return defaultRsvpService;
}

/**
 * Handles RSVP registration or waitlist entry for an event.
 * POST /api/events/{eventId}/rsvp
 */
export async function rsvpEventHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;
  try {
    const caller = requireAuth(event, authService);
    const rsvpService = service ?? getDefaultRsvpService();
    const result = await rsvpService.rsvpEvent(eventId, caller);

    // 201 Created for CONFIRMED reservations; 200 OK for WAITLISTED entries
    const statusCode = result.status === 'CONFIRMED' ? 201 : 200;
    return jsonResponse(statusCode, result, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

/**
 * Handles attendee registration cancellation.
 * DELETE /api/events/{eventId}/rsvp
 */
export async function cancelRsvpHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;
  try {
    const caller = requireAuth(event, authService);
    const rsvpService = service ?? getDefaultRsvpService();
    const result = await rsvpService.cancelRsvp(eventId, caller);
    return jsonResponse(200, result, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

/**
 * Retrieves caller's registrations list.
 * GET /api/me/rsvps
 */
export async function getMyRsvpsHandler(
  event: APIGatewayProxyEventV2,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;
  try {
    const caller = requireAuth(event, authService);
    const rsvpService = service ?? getDefaultRsvpService();
    const rsvps = await rsvpService.getMyRsvps(caller);
    return jsonResponse(200, { rsvps }, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }

  
}

/**
 * Retrieves attendees registered for an event.
 * GET /api/events/{eventId}/attendees
 */
export async function getEventAttendeesHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const rsvpService = service ?? getDefaultRsvpService();

    const attendees = await rsvpService.getEventAttendees(
      eventId,
      caller,
      event.queryStringParameters?.q || ''
    );

    return jsonResponse(200, { attendees }, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}
