import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';

// Provide standard local defaults if not already loaded from environment
const envDefaults: Record<string, string> = {
  AWS_REGION: 'us-east-1',
  USERS_TABLE: 'MarqueUsers',
  EVENTS_TABLE: 'MarqueEvents',
  EVENT_STAFF_TABLE: 'MarqueEventStaff',
  RSVPS_TABLE: 'MarqueRSVPs',
  WAITLIST_TABLE: 'MarqueWaitlist',
  TICKETS_TABLE: 'MarqueTickets',
  S3_BUCKET: 'marque-assets-secular-us-east-1',
  JWT_SECRET: 'dev-local-jwt-secret-key-minimum-32-chars-long!',
  JWT_EXPIRES_IN: '24h',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000',
  PORT: '3000',
};

for (const [key, val] of Object.entries(envDefaults)) {
  if (!process.env[key]) {
    process.env[key] = val;
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// In-Memory store for local dev mode when AWS credentials are not configured
let localUsers: any[] = [
  {
    userId: 'usr-attendee-demo',
    email: 'chandrabhanu@example.com',
    name: 'Chandrabhanu Prusty',
    role: 'ATTENDEE',
  },
  {
    userId: 'usr-organizer-01',
    email: 'organizer.neilsen@example.com',
    name: 'Neilsen Organizer',
    role: 'ORGANIZER',
  },
  {
    userId: 'usr-coordinator-01',
    email: 'coordinator.preeti@example.com',
    name: 'Preeti Coordinator',
    role: 'ATTENDEE',
  },
];

let localEvents: any[] = [
  {
    eventId: 'evt-ccl-hackathon-2026',
    title: 'Cloud Canvas 2026: Campus Hackathon',
    description: '48-hour premier cloud computing and web architecture hackathon at VESIT. Build, deploy serverless architectures on AWS, and pitch to industry judges.',
    category: 'Technology',
    startAt: '2026-11-20T09:00:00Z',
    endAt: '2026-11-22T17:00:00Z',
    venue: 'Auditorium & Lab 502, VESIT Campus',
    capacity: 100,
    confirmedCount: 88,
    status: 'PUBLISHED',
    organizerId: 'usr-organizer-01',
    bannerUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-10-01T10:00:00Z',
  },
  {
    eventId: 'evt-gdg-devfest',
    title: 'GDG Campus DevFest: AI & Web3 Summit',
    description: 'Explore the frontiers of Generative AI, modern frontend web frameworks, and cloud-native solutions with expert speakers from Google and industry leaders.',
    category: 'Workshop',
    startAt: '2026-11-25T10:00:00Z',
    endAt: '2026-11-25T18:00:00Z',
    venue: 'Amphitheatre, Central Block',
    capacity: 50,
    confirmedCount: 50, // Full event for waitlist demo
    status: 'PUBLISHED',
    organizerId: 'usr-organizer-01',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-10-05T12:00:00Z',
  },
  {
    eventId: 'evt-utsav-cultural-night',
    title: 'Utsav: Annual Cultural Symphony 2026',
    description: 'An evening of classical and contemporary musical performances, theatrical drama, and dynamic dance spectacles presented by the Cultural Council.',
    category: 'Cultural',
    startAt: '2026-12-05T18:00:00Z',
    endAt: '2026-12-05T22:30:00Z',
    venue: 'Main Ground & Open Stage',
    capacity: 250,
    confirmedCount: 142,
    status: 'PUBLISHED',
    organizerId: 'usr-organizer-02',
    bannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    createdAt: '2026-10-10T14:00:00Z',
  },
];

let localRsvps: any[] = [
  {
    rsvpId: 'rsvp-demo-1',
    eventId: 'evt-ccl-hackathon-2026',
    attendeeId: 'usr-attendee-demo',
    status: 'CONFIRMED',
    ticketId: 'tkt-8f3a9e1b2c4d',
    createdAt: '2026-10-18T10:00:00Z',
    updatedAt: '2026-10-18T10:00:00Z',
  },
  {
    rsvpId: 'rsvp-demo-2',
    eventId: 'evt-gdg-devfest',
    attendeeId: 'usr-attendee-demo',
    status: 'WAITLISTED',
    queueKey: '2026-10-19T14:30:00Z#usr-attendee-demo',
    createdAt: '2026-10-19T14:30:00Z',
    updatedAt: '2026-10-19T14:30:00Z',
  },
];

let localTickets: any[] = [
  {
    ticketId: 'tkt-8f3a9e1b2c4d',
    eventId: 'evt-ccl-hackathon-2026',
    attendeeId: 'usr-attendee-demo',
    attendeeName: 'Chandrabhanu Prusty',
    attendeeEmail: 'chandrabhanu@example.com',
    eventTitle: 'Cloud Canvas 2026: Campus Hackathon',
    eventVenue: 'Auditorium & Lab 502, VESIT Campus',
    eventStartAt: '2026-11-20T09:00:00Z',
    status: 'ACTIVE',
    issuedAt: '2026-10-18T10:00:00Z',
    checkInTimestamp: null,
    checkedInBy: null,
  },
];

let localStaff: any[] = [
  {
    eventId: 'evt-ccl-hackathon-2026',
    userId: 'usr-coordinator-01',
    email: 'coordinator.preeti@example.com',
    name: 'Preeti Coordinator',
    assignedRole: 'COORDINATOR',
    permissions: ['CHECK_IN'],
    assignedAt: '2026-10-12T10:00:00Z',
  },
];

let localWaitlist: any[] = [
  {
    eventId: 'evt-gdg-devfest',
    queueKey: '2026-10-19T14:30:00Z#usr-attendee-demo',
    attendeeId: 'usr-attendee-demo',
    name: 'Chandrabhanu Prusty',
    email: 'chandrabhanu@example.com',
    createdAt: '2026-10-19T14:30:00Z',
  },
];

// Helper to extract authenticated user from Authorization header
function getAuthUser(req: http.IncomingMessage) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  try {
    const decoded: any = jwt.verify(
      token,
      process.env.JWT_SECRET || 'dev-local-jwt-secret-key-minimum-32-chars-long!'
    );
    const found = localUsers.find(
      u => u.userId === decoded.userId || u.email.toLowerCase() === (decoded.email || '').toLowerCase()
    );
    if (found) return found;
    return decoded;
  } catch {
    // Search by token hint or default demo user
    if (token.includes('organizer')) {
      return localUsers.find(u => u.role === 'ORGANIZER') || localUsers[1];
    }
    if (token.includes('coordinator')) {
      return localUsers.find(u => u.email.includes('coordinator')) || localUsers[2];
    }
    return localUsers[0];
  }
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks).toString('utf-8');
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();
    const origin = req.headers.origin || 'http://localhost:5173';

    // Set standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Bootstrap-Secret');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    let bodyJson: any = {};
    if (rawBody) {
      try {
        bodyJson = JSON.parse(rawBody);
      } catch {}
    }

    const sendJson = (status: number, data: any) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    const sendError = (status: number, code: string, message: string) => {
      sendJson(status, { error: { code, message } });
    };

    console.log(`[DevServer] ${method} ${pathname}`);

    // Health check
    if (pathname === '/health' || pathname === '/api/health') {
      sendJson(200, { status: 'healthy', timestamp: new Date().toISOString(), mode: 'local-dev' });
      return;
    }

    // Auth: Login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = bodyJson;
      if (!email || !password) {
        sendError(400, 'VALIDATION_ERROR', 'Email and password required.');
        return;
      }
      const cleanEmail = email.toLowerCase().trim();
      let found = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

      // Auto-register demo logins on the fly if needed
      if (!found) {
        const isOrg = cleanEmail.includes('organizer');
        found = {
          userId: `usr-${Date.now().toString(36)}`,
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          role: isOrg ? 'ORGANIZER' : 'ATTENDEE',
        };
        localUsers.push(found);
      }

      const token = jwt.sign(
        {
          userId: found.userId,
          email: found.email,
          name: found.name,
          role: found.role,
        },
        process.env.JWT_SECRET || 'dev-local-jwt-secret-key-minimum-32-chars-long!',
        { expiresIn: '24h' }
      );

      sendJson(200, {
        token,
        user: found,
      });
      return;
    }

    // Auth: Register
    if (pathname === '/api/auth/register' && method === 'POST') {
      const { name, email, password } = bodyJson;
      if (!email || !password) {
        sendError(400, 'VALIDATION_ERROR', 'Email and password required.');
        return;
      }
      const cleanEmail = email.toLowerCase().trim();
      const existing = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        sendError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
        return;
      }

      const newUser = {
        userId: `usr-${Date.now().toString(36)}`,
        name: name || 'Campus Attendee',
        email: cleanEmail,
        role: 'ATTENDEE',
      };
      localUsers.push(newUser);
      const token = jwt.sign(
        {
          userId: newUser.userId,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
        },
        process.env.JWT_SECRET || 'dev-local-jwt-secret-key-minimum-32-chars-long!',
        { expiresIn: '24h' }
      );
      sendJson(201, {
        token,
        user: newUser,
      });
      return;
    }

    // Auth: Me
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) {
        sendError(401, 'UNAUTHORIZED', 'Missing or invalid token.');
        return;
      }
      sendJson(200, { user });
      return;
    }

    // Events: List
    if (pathname === '/api/events' && method === 'GET') {
      const statusParam = url.searchParams.get('status');
      const filtered = statusParam
        ? localEvents.filter(e => e.status === statusParam)
        : localEvents;
      sendJson(200, { events: filtered });
      return;
    }

    // Events: Create
    if (pathname === '/api/events' && method === 'POST') {
      const user = getAuthUser(req);
      if (!user || user.role !== 'ORGANIZER') {
        sendError(403, 'FORBIDDEN', 'Only organizers can create events.');
        return;
      }
      const { title, description, category, venue, capacity, startAt, endAt, bannerUrl } = bodyJson;
      const newEvent = {
        eventId: `evt-${Date.now().toString(36)}`,
        title,
        description: description || '',
        category: category || 'Technology',
        venue,
        capacity: Number(capacity) || 50,
        confirmedCount: 0,
        status: 'PUBLISHED',
        organizerId: user.userId,
        bannerUrl: bannerUrl || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
        createdAt: new Date().toISOString(),
        startAt,
        endAt,
      };
      localEvents.unshift(newEvent);
      sendJson(201, { event: newEvent });
      return;
    }

    // Events: Single Event (GET / PATCH)
    const eventMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)$/);
    if (eventMatch) {
      const eventId = eventMatch[1];
      const event = localEvents.find(e => e.eventId === eventId);
      if (!event) {
        sendError(404, 'EVENT_NOT_FOUND', 'Event not found.');
        return;
      }

      if (method === 'GET') {
        sendJson(200, { event });
        return;
      }

      if (method === 'PATCH') {
        const user = getAuthUser(req);
        if (!user || (user.role !== 'ORGANIZER' && event.organizerId !== user.userId)) {
          sendError(403, 'FORBIDDEN', 'Not authorized to update this event.');
          return;
        }
        Object.assign(event, bodyJson);
        sendJson(200, { event });
        return;
      }
    }

    // Events: RSVP
    const rsvpMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/rsvp$/);
    if (rsvpMatch) {
      const eventId = rsvpMatch[1];
      const user = getAuthUser(req);
      if (!user) {
        sendError(401, 'UNAUTHORIZED', 'Authentication required.');
        return;
      }
      const event = localEvents.find(e => e.eventId === eventId);
      if (!event) {
        sendError(404, 'EVENT_NOT_FOUND', 'Event not found.');
        return;
      }

      if (method === 'POST') {
        const existing = localRsvps.find(r => r.eventId === eventId && r.attendeeId === user.userId && r.status !== 'CANCELLED');
        if (existing) {
          sendError(409, 'DUPLICATE_REGISTRATION', 'You have already registered for this event.');
          return;
        }

        const rsvpId = `rsvp-${Date.now().toString(36)}`;
        if (event.confirmedCount < event.capacity) {
          event.confirmedCount += 1;
          const ticketId = `tkt-${Math.random().toString(36).substring(2, 10)}`;
          const newRsvp = {
            rsvpId,
            eventId,
            attendeeId: user.userId,
            status: 'CONFIRMED',
            ticketId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          localRsvps.unshift(newRsvp);
          localTickets.unshift({
            ticketId,
            eventId,
            attendeeId: user.userId,
            attendeeName: user.name,
            attendeeEmail: user.email,
            eventTitle: event.title,
            eventVenue: event.venue,
            eventStartAt: event.startAt,
            status: 'ACTIVE',
            issuedAt: new Date().toISOString(),
          });
          sendJson(201, { status: 'CONFIRMED', rsvpId, ticketId });
          return;
        } else {
          // Waitlist
          const queueKey = `${new Date().toISOString()}#${user.userId}`;
          const newRsvp = {
            rsvpId,
            eventId,
            attendeeId: user.userId,
            status: 'WAITLISTED',
            queueKey,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          localRsvps.unshift(newRsvp);
          localWaitlist.push({
            eventId,
            queueKey,
            attendeeId: user.userId,
            name: user.name,
            email: user.email,
            createdAt: new Date().toISOString(),
          });
          const position = localWaitlist.filter(w => w.eventId === eventId).length;
          sendJson(200, { status: 'WAITLISTED', rsvpId, queuePosition: position });
          return;
        }
      }

      if (method === 'DELETE') {
        const rsvp = localRsvps.find(r => r.eventId === eventId && r.attendeeId === user.userId && r.status !== 'CANCELLED');
        if (!rsvp) {
          sendError(404, 'RSVP_NOT_FOUND', 'No active RSVP found for this event.');
          return;
        }

        const wasConfirmed = rsvp.status === 'CONFIRMED';
        rsvp.status = 'CANCELLED';
        rsvp.updatedAt = new Date().toISOString();

        if (rsvp.ticketId) {
          const tkt = localTickets.find(t => t.ticketId === rsvp.ticketId);
          if (tkt) tkt.status = 'CANCELLED';
          delete (rsvp as any).ticketId;
        }
        delete (rsvp as any).queueKey;

        // Auto-promote from waitlist if seats freed
        let promotedAttendee = null;
        if (wasConfirmed) {
          event.confirmedCount = Math.max(0, event.confirmedCount - 1);
          const topWaitlistedIdx = localWaitlist.findIndex(w => w.eventId === eventId);
          if (topWaitlistedIdx !== -1) {
            const nextWaitlist = localWaitlist.splice(topWaitlistedIdx, 1)[0];
            const candidateRsvp = localRsvps.find(r => r.eventId === eventId && r.attendeeId === nextWaitlist.attendeeId);
            if (candidateRsvp) {
              const newTicketId = `tkt-${Math.random().toString(36).substring(2, 10)}`;
              candidateRsvp.status = 'CONFIRMED';
              candidateRsvp.ticketId = newTicketId;
              delete (candidateRsvp as any).queueKey;
              event.confirmedCount += 1;
              localTickets.unshift({
                ticketId: newTicketId,
                eventId,
                attendeeId: nextWaitlist.attendeeId,
                attendeeName: nextWaitlist.name,
                attendeeEmail: nextWaitlist.email,
                eventTitle: event.title,
                eventVenue: event.venue,
                eventStartAt: event.startAt,
                status: 'ACTIVE',
                issuedAt: new Date().toISOString(),
              });
              promotedAttendee = nextWaitlist.attendeeId;
            }
          }
        }

        sendJson(200, { status: 'CANCELLED', message: 'Registration cancelled successfully.', promotedAttendee });
        return;
      }
    }

    // Attendees: My RSVPs
    if (pathname === '/api/me/rsvps' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) {
        sendError(401, 'UNAUTHORIZED', 'Authentication required.');
        return;
      }
      const userRsvps = localRsvps.filter(r => r.attendeeId === user.userId && r.status !== 'CANCELLED');
      const enriched = userRsvps.map(r => {
        const ev = localEvents.find(e => e.eventId === r.eventId);
        return {
          ...r,
          event: ev ? { title: ev.title, venue: ev.venue, startAt: ev.startAt } : { title: 'Campus Event', venue: 'Campus', startAt: new Date().toISOString() }
        };
      });
      sendJson(200, { rsvps: enriched });
      return;
    }

    // Tickets: Single Ticket
    const ticketMatch = pathname.match(/^\/api\/tickets\/([a-zA-Z0-9_-]+)$/);
    if (ticketMatch && method === 'GET') {
      const ticketId = ticketMatch[1];
      const ticket = localTickets.find(t => t.ticketId === ticketId);
      if (!ticket) {
        sendError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
        return;
      }
      sendJson(200, { ticket });
      return;
    }

    // Check-in: POST /api/events/:eventId/check-in or /checkin
    const checkinMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/(?:check-in|checkin)$/);
    if (checkinMatch && method === 'POST') {
      const eventId = checkinMatch[1];
      const { ticketId } = bodyJson;
      const ticket = localTickets.find(t => t.ticketId === ticketId);
      if (!ticket) {
        sendError(404, 'TICKET_NOT_FOUND', 'Invalid ticket reference.');
        return;
      }
      if (ticket.eventId !== eventId) {
        sendError(400, 'INVALID_EVENT', 'Ticket does not belong to this event.');
        return;
      }
      if (ticket.status === 'CHECKED_IN') {
        sendError(409, 'ALREADY_CHECKED_IN', `Attendee already checked in at ${ticket.checkInTimestamp || 'earlier'}.`);
        return;
      }
      if (ticket.status === 'CANCELLED') {
        sendError(409, 'TICKET_CANCELLED', 'This ticket has been cancelled.');
        return;
      }

      ticket.status = 'CHECKED_IN';
      ticket.checkInTimestamp = new Date().toISOString();
      ticket.checkedInBy = 'usr-coordinator-01';

      sendJson(200, {
        success: true,
        message: `Successfully checked in ${ticket.attendeeName}!`,
        ticket,
      });
      return;
    }

    // Event Stats
    const statsMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/stats$/);
    if (statsMatch && method === 'GET') {
      const eventId = statsMatch[1];
      const ev = localEvents.find(e => e.eventId === eventId);
      if (!ev) {
        sendError(404, 'EVENT_NOT_FOUND', 'Event not found.');
        return;
      }
      const evTickets = localTickets.filter(t => t.eventId === eventId);
      const checkedInCount = evTickets.filter(t => t.status === 'CHECKED_IN').length;
      const waitlistCount = localWaitlist.filter(w => w.eventId === eventId).length;
      const confirmedCount = ev.confirmedCount;
      const attendancePercentage = confirmedCount > 0 ? Math.round((checkedInCount / confirmedCount) * 100) : 0;
      sendJson(200, {
        capacity: ev.capacity,
        confirmedCount,
        waitlistCount,
        checkedInCount,
        attendancePercentage,
      });
      return;
    }

    // Attendees roster: /api/events/:eventId/attendees
    const attendeesMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/attendees$/);
    if (attendeesMatch && method === 'GET') {
      const eventId = attendeesMatch[1];
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const evTickets = localTickets.filter(t => t.eventId === eventId);
      const filtered = evTickets.filter(t => {
        if (!q) return true;
        return t.attendeeName.toLowerCase().includes(q) || t.attendeeEmail.toLowerCase().includes(q) || t.ticketId.toLowerCase().includes(q);
      });
      const results = filtered.map(t => ({
        ticketId: t.ticketId,
        attendeeName: t.attendeeName,
        attendeeEmail: t.attendeeEmail,
        status: t.status,
        checkInTimestamp: t.checkInTimestamp || null,
      }));
      sendJson(200, { attendees: results });
      return;
    }

    // Staff routes: /api/events/:eventId/staff
    const staffMatch = pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/staff$/);
    if (staffMatch) {
      const eventId = staffMatch[1];
      if (method === 'GET') {
        const staffList = localStaff.filter(s => s.eventId === eventId);
        sendJson(200, { staff: staffList });
        return;
      }
      if (method === 'POST') {
        const { email } = bodyJson;
        const cleanEmail = (email || '').toLowerCase().trim();
        const foundUser = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
        if (!foundUser) {
          sendError(400, 'USER_NOT_FOUND', `No registered account found with email ${cleanEmail}.`);
          return;
        }
        const existing = localStaff.find(s => s.eventId === eventId && s.userId === foundUser.userId);
        if (existing) {
          sendError(409, 'ALREADY_ASSIGNED', 'User is already assigned as coordinator for this event.');
          return;
        }
        const newStaff = {
          eventId,
          userId: foundUser.userId,
          email: foundUser.email,
          name: foundUser.name,
          assignedRole: 'COORDINATOR',
          permissions: ['CHECK_IN'],
          assignedAt: new Date().toISOString(),
        };
        localStaff.push(newStaff);
        sendJson(201, { success: true, staff: newStaff });
        return;
      }
    }

    // Coordinator assigned events: /api/me/assigned-events
    if (pathname === '/api/me/assigned-events' && method === 'GET') {
      const user = getAuthUser(req);
      if (!user) {
        sendError(401, 'UNAUTHORIZED', 'Authentication required.');
        return;
      }
      const myStaffAssignments = localStaff.filter(s => s.userId === user.userId);
      const events = myStaffAssignments.map(s => {
        const ev = localEvents.find(e => e.eventId === s.eventId);
        return {
          eventId: s.eventId,
          title: ev?.title || 'Campus Event',
          venue: ev?.venue || 'Campus',
          startAt: ev?.startAt || new Date().toISOString(),
          assignedRole: s.assignedRole,
          permissions: s.permissions,
        };
      });
      sendJson(200, { events });
      return;
    }

    // Fallback: 404
    sendError(404, 'NOT_FOUND', `Route ${method} ${pathname} not found.`);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  MARQUE BACKEND LOCAL SERVER STARTED`);
  console.log(`  Listening on: http://localhost:${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/health`);
  console.log(`  CORS Enabled for: http://localhost:5173`);
  console.log(`=======================================================`);
});
