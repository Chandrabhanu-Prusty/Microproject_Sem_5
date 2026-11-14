import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { NotFoundError } from '../utils/errors.js';
import { registerHandler, loginHandler, meHandler } from '../handlers/auth.handler.js';
import {
  listEventsHandler,
  getEventHandler,
  createEventHandler,
  updateEventHandler,
} from '../handlers/event.handler.js';
import {
  listStaffHandler,
  assignStaffHandler,
  revokeStaffHandler,
  listAssignedEventsHandler,
} from '../handlers/staff.handler.js';
import {
  rsvpEventHandler,
  cancelRsvpHandler,
  getMyRsvpsHandler,
  getEventAttendeesHandler,
} from '../handlers/rsvp.handler.js';
import type { AuthService } from '../services/auth.service.js';
import type { EventService } from '../services/event.service.js';
import type { StaffService } from '../services/staff.service.js';
import type { RsvpService } from '../services/rsvp.service.js';

export interface RouterServices {
  authService?: AuthService;
  eventService?: EventService;
  staffService?: StaffService;
  rsvpService?: RsvpService;
}

/**
 * Dispatches API Gateway HTTP API v2 events to the appropriate route handler.
 */
export async function routeRequest(
  event: APIGatewayProxyEventV2,
  services?: RouterServices
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || '/';

  // 1. Static Authentication Routes
  if (method === 'POST' && path === '/api/auth/register') {
    return registerHandler(event, services?.authService);
  }

  if (method === 'POST' && path === '/api/auth/login') {
    return loginHandler(event, services?.authService);
  }

  if (method === 'GET' && path === '/api/auth/me') {
    return meHandler(event, services?.authService);
  }

  // 2. User Routes (/api/me/...)
  if (method === 'GET' && path === '/api/me/assigned-events') {
    return listAssignedEventsHandler(event, services?.staffService, services?.authService);
  }

  if (method === 'GET' && path === '/api/me/rsvps') {
    return getMyRsvpsHandler(event, services?.rsvpService, services?.authService);
  }

  // 3. Events Collection Routes
  if (method === 'GET' && path === '/api/events') {
    return listEventsHandler(event, services?.eventService);
  }

  if (method === 'POST' && path === '/api/events') {
    return createEventHandler(event, services?.eventService, services?.authService);
  }

  // 4. Event RSVP Sub-resource Routes (/api/events/{eventId}/rsvp)
  const eventRsvpMatch = path.match(/^\/api\/events\/([^/]+)\/rsvp$/);
  if (eventRsvpMatch) {
    const eventId = decodeURIComponent(eventRsvpMatch[1]);
    if (method === 'POST') {
      return rsvpEventHandler(event, eventId, services?.rsvpService, services?.authService);
    }
    if (method === 'DELETE') {
      return cancelRsvpHandler(event, eventId, services?.rsvpService, services?.authService);
    }
  }

  // 5. Event Staff Sub-resource Routes (/api/events/{eventId}/staff/...)
  const staffMemberMatch = path.match(/^\/api\/events\/([^/]+)\/staff\/([^/]+)$/);
  if (staffMemberMatch) {
    const eventId = decodeURIComponent(staffMemberMatch[1]);
    const userId = decodeURIComponent(staffMemberMatch[2]);

    if (method === 'DELETE') {
      return revokeStaffHandler(event, eventId, userId, services?.staffService, services?.authService);
    }
  }

  const staffCollectionMatch = path.match(/^\/api\/events\/([^/]+)\/staff$/);
  if (staffCollectionMatch) {
    const eventId = decodeURIComponent(staffCollectionMatch[1]);

    if (method === 'GET') {
      return listStaffHandler(event, eventId, services?.staffService, services?.authService);
    }
    if (method === 'POST') {
      return assignStaffHandler(event, eventId, services?.staffService, services?.authService);
    }
  }
  // 6. Event Attendees Route (/api/events/{eventId}/attendees)
  const eventAttendeesMatch = path.match(/^\/api\/events\/([^/]+)\/attendees$/);

  if (eventAttendeesMatch && method === 'GET') {
    const eventId = decodeURIComponent(eventAttendeesMatch[1]);

    return getEventAttendeesHandler(
      event,
      eventId,
      services?.rsvpService,
      services?.authService
    );
  }
  // 6. Individual Event Resource Routes (/api/events/{eventId})
  const eventMatch = path.match(/^\/api\/events\/([^/]+)$/);
  if (eventMatch) {
    const eventId = decodeURIComponent(eventMatch[1]);

    if (method === 'GET') {
      return getEventHandler(event, eventId, services?.eventService);
    }
    if (method === 'PATCH') {
      return updateEventHandler(event, eventId, services?.eventService, services?.authService);
    }
  }

  // 7. Unmatched Route -> 404 ROUTE_NOT_FOUND
  throw new NotFoundError('ROUTE_NOT_FOUND', `Cannot ${method} ${path}`);
}
