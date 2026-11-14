import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
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

export async function rsvpEventHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const result = await (service ?? getDefaultRsvpService()).rsvpEvent(
      eventId,
      caller
    );

    return jsonResponse(
      result.status === 'CONFIRMED' ? 201 : 200,
      result,
      origin
    );
  } catch (err) {
    return errorResponse(err, origin);
  }
}

export async function cancelRsvpHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const result = await (service ?? getDefaultRsvpService()).cancelRsvp(
      eventId,
      caller
    );

    return jsonResponse(200, result, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

export async function getMyRsvpsHandler(
  event: APIGatewayProxyEventV2,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const rsvps = await (
      service ?? getDefaultRsvpService()
    ).getMyRsvps(caller);

    return jsonResponse(200, { rsvps }, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

export async function getEventAttendeesHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const attendees = await (
      service ?? getDefaultRsvpService()
    ).getEventAttendees(
      eventId,
      caller,
      event.queryStringParameters?.q || ''
    );

    return jsonResponse(200, { attendees }, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

/**
 * POST /api/events/{eventId}/check-in
 */
export async function checkInTicketHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);

    let body: { ticketId?: string };

    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(
        400,
        {
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must contain valid JSON.',
          },
        },
        origin
      );
    }

    const ticketId = body.ticketId?.trim();

    if (!ticketId) {
      return jsonResponse(
        400,
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ticketId is required.',
          },
        },
        origin
      );
    }

    const result = await (
      service ?? getDefaultRsvpService()
    ).checkInTicket(eventId, ticketId, caller);

    return jsonResponse(200, result, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}

/**
 * GET /api/events/{eventId}/stats
 */
export async function getEventStatsHandler(
  event: APIGatewayProxyEventV2,
  eventId: string,
  service?: RsvpService,
  authService?: AuthService
): Promise<APIGatewayProxyResultV2> {
  const origin = event.headers?.origin || event.headers?.Origin;

  try {
    const caller = requireAuth(event, authService);
    const result = await (
      service ?? getDefaultRsvpService()
    ).getEventStats(eventId, caller);

    return jsonResponse(200, result, origin);
  } catch (err) {
    return errorResponse(err, origin);
  }
}