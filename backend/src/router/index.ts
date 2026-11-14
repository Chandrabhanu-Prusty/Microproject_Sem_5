import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { NotFoundError } from '../utils/errors.js';

import {
  registerHandler,
  loginHandler,
  meHandler,
} from '../handlers/auth.handler.js';

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
  checkInTicketHandler,
  getEventStatsHandler,
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

export async function routeRequest(
  event: APIGatewayProxyEventV2,
  services?: RouterServices
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || '/';

  // Authentication
  if (method === 'POST' && path === '/api/auth/register') {
    return registerHandler(event, services?.authService);
  }

  if (method === 'POST' && path === '/api/auth/login') {
    return loginHandler(event, services?.authService);
  }

  if (method === 'GET' && path === '/api/auth/me') {
    return meHandler(event, services?.authService);
  }

  // User routes
  if (method === 'GET' && path === '/api/me/assigned-events') {
    return listAssignedEventsHandler(
      event,
      services?.staffService,
      services?.authService
    );
  }

  if (method === 'GET' && path === '/api/me/rsvps') {
    return getMyRsvpsHandler(
      event,
      services?.rsvpService,
      services?.authService
    );
  }

  // Event collection
  if (method === 'GET' && path === '/api/events') {
    return listEventsHandler(event, services?.eventService);
  }

  if (method === 'POST' && path === '/api/events') {
    return createEventHandler(
      event,
      services?.eventService,
      services?.authService
    );
  }

  // RSVP routes
  const eventRsvpMatch = path.match(/^\/api\/events\/([^/]+)\/rsvp$/);

  if (eventRsvpMatch) {
    const eventId = decodeURIComponent(eventRsvpMatch[1]);

    if (method === 'POST') {
      return rsvpEventHandler(
        event,
        eventId,
        services?.rsvpService,
        services?.authService
      );
    }

    if (method === 'DELETE') {
      return cancelRsvpHandler(
        event,
        eventId,
        services?.rsvpService,
        services?.authService
      );
    }
  }

  // Check-in route
  const checkInMatch = path.match(
    /^\/api\/events\/([^/]+)\/check-in$/
  );

  if (checkInMatch && method === 'POST') {
    return checkInTicketHandler(
      event,
      decodeURIComponent(checkInMatch[1]),
      services?.rsvpService,
      services?.authService
    );
  }

  // Statistics route
  const statsMatch = path.match(/^\/api\/events\/([^/]+)\/stats$/);

  if (statsMatch && method === 'GET') {
    return getEventStatsHandler(
      event,
      decodeURIComponent(statsMatch[1]),
      services?.rsvpService,
      services?.authService
    );
  }

  // Staff member routes
  const staffMemberMatch = path.match(
    /^\/api\/events\/([^/]+)\/staff\/([^/]+)$/
  );

  if (staffMemberMatch) {
    const eventId = decodeURIComponent(staffMemberMatch[1]);
    const userId = decodeURIComponent(staffMemberMatch[2]);

    if (method === 'DELETE') {
      return revokeStaffHandler(
        event,
        eventId,
        userId,
        services?.staffService,
        services?.authService
      );
    }
  }

  // Staff collection routes
  const staffCollectionMatch = path.match(
    /^\/api\/events\/([^/]+)\/staff$/
  );

  if (staffCollectionMatch) {
    const eventId = decodeURIComponent(staffCollectionMatch[1]);

    if (method === 'GET') {
      return listStaffHandler(
        event,
        eventId,
        services?.staffService,
        services?.authService
      );
    }

    if (method === 'POST') {
      return assignStaffHandler(
        event,
        eventId,
        services?.staffService,
        services?.authService
      );
    }
  }

  // Attendee list
  const eventAttendeesMatch = path.match(
    /^\/api\/events\/([^/]+)\/attendees$/
  );

  if (eventAttendeesMatch && method === 'GET') {
    return getEventAttendeesHandler(
      event,
      decodeURIComponent(eventAttendeesMatch[1]),
      services?.rsvpService,
      services?.authService
    );
  }

  // Individual event
  const eventMatch = path.match(/^\/api\/events\/([^/]+)$/);

  if (eventMatch) {
    const eventId = decodeURIComponent(eventMatch[1]);

    if (method === 'GET') {
      return getEventHandler(event, eventId, services?.eventService);
    }

    if (method === 'PATCH') {
      return updateEventHandler(
        event,
        eventId,
        services?.eventService,
        services?.authService
      );
    }
  }

  throw new NotFoundError('ROUTE_NOT_FOUND', `Cannot ${method} ${path}`);
}