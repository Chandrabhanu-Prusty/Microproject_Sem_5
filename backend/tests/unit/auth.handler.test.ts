import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerHandler,
  loginHandler,
  meHandler,
  bootstrapHandler,
} from '../../src/handlers/auth.handler.js';
import { AuthService } from '../../src/services/auth.service.js';
import { getEnv, resetEnvCache } from '../../src/config/env.js';
import { UnauthorizedError } from '../../src/utils/errors.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const testEnv = {
  USERS_TABLE: 'MarqueUsers',
  EVENTS_TABLE: 'MarqueEvents',
  EVENT_STAFF_TABLE: 'MarqueEventStaff',
  RSVPS_TABLE: 'MarqueRSVPs',
  WAITLIST_TABLE: 'MarqueWaitlist',
  TICKETS_TABLE: 'MarqueTickets',
  S3_BUCKET: 'actual-s3-bucket-name',
  JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars-long',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  BOOTSTRAP_SECRET: 'bootstrap-secret-16',
};

function createMockEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /api/auth/register',
    rawPath: '/api/auth/register',
    rawQueryString: '',
    headers: {
      origin: 'http://localhost:5173',
      ...overrides.headers,
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'id.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'id',
      http: {
        method: 'POST',
        path: '/api/auth/register',
        protocol: 'HTTP/1.1',
        sourceIp: '192.168.1.1',
        userAgent: 'test-agent',
      },
      requestId: 'req-id',
      routeKey: 'POST /api/auth/register',
      stage: '$default',
      time: '01/Nov/2026:10:00:00 +0000',
      timeEpoch: 1600000000,
    },
    isBase64Encoded: false,
    body: undefined,
    ...overrides,
  };
}

describe('Auth Handlers Unit Tests', () => {
  describe('registerHandler', () => {
    test('returns 400 VALIDATION_ERROR when request body is empty or malformed', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({ body: undefined });
      const res = (await registerHandler(event)) as any;

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 400 VALIDATION_ERROR when password is too short', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Ananya Sen',
          email: 'ananya@vesit.edu',
          password: 'short', // < 8 chars
        }),
      });

      const res = (await registerHandler(event)) as any;
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /Password must be at least 8 characters/);
    });

    test('returns 400 VALIDATION_ERROR when password lacks number or special character', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Ananya Sen',
          email: 'ananya@vesit.edu',
          password: 'LettersOnlyPassword', // >= 8 chars but no numbers or special chars
        }),
      });

      const res = (await registerHandler(event)) as any;
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /Password must contain at least one number or special character/);
    });

    test('returns 400 VALIDATION_ERROR when password exceeds 72 UTF-8 bytes (boundary: 73 ASCII bytes)', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Boundary Test',
          email: 'boundary73@vesit.edu',
          password: 'A'.repeat(71) + '1!', // 73 bytes ASCII with number and special char
        }),
      });

      const res = (await registerHandler(event)) as any;
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /Password must not exceed 72 bytes/);
    });

    test('returns 400 VALIDATION_ERROR when multibyte characters exceed 72 bytes even with short string length', async () => {
      resetEnvCache();
      getEnv(testEnv);

      // '🔒' is 4 bytes in UTF-8. 19 of them = 76 bytes, but JS .length is only 38
      const multibytePassword = '🔒'.repeat(19);
      assert.equal(Buffer.byteLength(multibytePassword, 'utf8'), 76);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Multibyte Test',
          email: 'multibyte@vesit.edu',
          password: multibytePassword,
        }),
      });

      const res = (await registerHandler(event)) as any;
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.match(body.error.message, /Password must not exceed 72 bytes/);
    });

    test('accepts password of exactly 72 UTF-8 bytes at upper boundary with complexity', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        register: async () => ({
          token: 'mock.jwt.token',
          user: { userId: 'usr-boundary', name: 'Boundary 72', email: 'boundary72@vesit.edu', role: 'ATTENDEE' },
        }),
      } as unknown as AuthService;

      // 70 'A's + '1' + '!' = 72 bytes
      const exact72 = 'A'.repeat(70) + '1!';
      assert.equal(Buffer.byteLength(exact72, 'utf8'), 72);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Boundary 72',
          email: 'boundary72@vesit.edu',
          password: exact72,
        }),
      });

      const res = (await registerHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 201);
    });

    test('accepts password with at least one number (no special character)', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        register: async () => ({
          token: 'mock.jwt.token',
          user: { userId: 'usr-num', name: 'Num Only', email: 'num@vesit.edu', role: 'ATTENDEE' },
        }),
      } as unknown as AuthService;

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Num Only',
          email: 'num@vesit.edu',
          password: 'Password123',
        }),
      });

      const res = (await registerHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 201);
    });

    test('accepts password with at least one special character (no numbers)', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        register: async () => ({
          token: 'mock.jwt.token',
          user: { userId: 'usr-spec', name: 'Spec Only', email: 'spec@vesit.edu', role: 'ATTENDEE' },
        }),
      } as unknown as AuthService;

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Spec Only',
          email: 'spec@vesit.edu',
          password: 'Password!',
        }),
      });

      const res = (await registerHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 201);
    });

    test('accepts valid multibyte password within 72 UTF-8 bytes', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        register: async () => ({
          token: 'mock.jwt.token',
          user: { userId: 'usr-multi', name: 'Multi OK', email: 'multiok@vesit.edu', role: 'ATTENDEE' },
        }),
      } as unknown as AuthService;

      // '🔒' is 4 bytes in UTF-8. 18 of them = 72 bytes (counts as special characters in UTF-8 non-alphanumeric)
      const validMultibyte = '🔒'.repeat(18);
      assert.equal(Buffer.byteLength(validMultibyte, 'utf8'), 72);

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Multi OK',
          email: 'multiok@vesit.edu',
          password: validMultibyte,
        }),
      });

      const res = (await registerHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 201);
    });

    test('returns 201 Created on valid registration input', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        register: async (input: any) => ({
          token: 'mock.jwt.token',
          user: {
            userId: 'usr-new-1',
            name: input.name,
            email: input.email,
            role: 'ATTENDEE',
          },
        }),
      } as unknown as AuthService;

      const event = createMockEvent({
        body: JSON.stringify({
          name: 'Ananya Sen',
          email: 'ananya@vesit.edu',
          password: 'ValidPassword123!',
        }),
      });

      const res = (await registerHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 201);
      assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');

      const body = JSON.parse(res.body);
      assert.equal(body.token, 'mock.jwt.token');
      assert.equal(body.user.role, 'ATTENDEE');
      assert.equal(body.user.email, 'ananya@vesit.edu');
    });
  });

  describe('loginHandler', () => {
    test('returns 400 VALIDATION_ERROR when email is missing', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({
        body: JSON.stringify({ password: 'SomePassword!' }),
      });

      const res = (await loginHandler(event)) as any;
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    });

    test('returns 200 OK on valid credentials', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        login: async () => ({
          token: 'valid.auth.token',
          user: {
            userId: 'usr-login-1',
            name: 'Ananya Sen',
            email: 'ananya@vesit.edu',
            role: 'ATTENDEE',
          },
        }),
      } as unknown as AuthService;

      const event = createMockEvent({
        body: JSON.stringify({
          email: 'ananya@vesit.edu',
          password: 'ValidPassword123!',
        }),
      });

      const res = (await loginHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 200);

      const body = JSON.parse(res.body);
      assert.equal(body.token, 'valid.auth.token');
      assert.equal(body.user.userId, 'usr-login-1');
    });

    test('allows login with simple password lacking registration complexity', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        login: async () => ({
          token: 'valid.auth.token',
          user: {
            userId: 'usr-login-simple',
            name: 'Simple User',
            email: 'simple@vesit.edu',
            role: 'ATTENDEE',
          },
        }),
      } as unknown as AuthService;

      // 'simple' has only letters and < 8 chars, yet loginSchema permits it
      const event = createMockEvent({
        body: JSON.stringify({
          email: 'simple@vesit.edu',
          password: 'simple',
        }),
      });

      const res = (await loginHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 200);
    });

    test('returns 401 INVALID_CREDENTIALS on failed authentication', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        login: async () => {
          throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
        },
      } as unknown as AuthService;

      const event = createMockEvent({
        body: JSON.stringify({
          email: 'ananya@vesit.edu',
          password: 'WrongPassword!',
        }),
      });

      const res = (await loginHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 401);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(body.error.message, 'Invalid email or password.');
    });
  });

  describe('meHandler', () => {
    test('returns 401 UNAUTHORIZED when Authorization header is absent', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const event = createMockEvent({ headers: {} });
      const res = (await meHandler(event)) as any;
      assert.equal(res.statusCode, 401);
      const body = JSON.parse(res.body);
      assert.equal(body.error.code, 'UNAUTHORIZED');
    });

    test('returns 200 OK with user profile when valid token provided', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockService = {
        verifyToken: (token: string) => {
          if (token === 'valid.token') {
            return { userId: 'usr-me-1', email: 'me@vesit.edu', role: 'ATTENDEE' };
          }
          throw new UnauthorizedError('Invalid token');
        },
        getProfile: async (uid: string) => ({
          userId: uid,
          name: 'Me User',
          email: 'me@vesit.edu',
          role: 'ATTENDEE',
        }),
      } as unknown as AuthService;

      const event = createMockEvent({
        headers: {
          authorization: 'Bearer valid.token',
          origin: 'http://localhost:5173',
        },
      });

      const res = (await meHandler(event, mockService)) as any;
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.user.userId, 'usr-me-1');
      assert.equal(body.user.name, 'Me User');
    });
  });

  describe('bootstrapHandler', () => {
    test('returns 400 VALIDATION_ERROR on malformed direct event', async () => {
      const res = await bootstrapHandler({
        action: 'BOOTSTRAP_ORGANIZER',
        email: 'invalid-email',
        secret: 'short',
      } as any);

      assert.equal(res.statusCode, 400);
      assert.equal(res.error, 'VALIDATION_ERROR');
    });

    test('returns 200 OK on successful bootstrap invocation', async () => {
      const mockService = {
        bootstrapOrganizer: async (email: string) => ({
          success: true,
          promotedUserId: 'usr-promoted-01',
          email,
          role: 'ORGANIZER',
          message: 'Organizer bootstrap successfully executed.',
        }),
      } as unknown as AuthService;

      const res = await bootstrapHandler(
        {
          action: 'BOOTSTRAP_ORGANIZER',
          email: 'admin@vesit.edu',
          secret: 'super-secret-bootstrap-key-16',
        },
        mockService
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.role, 'ORGANIZER');
      assert.equal(res.promotedUserId, 'usr-promoted-01');
    });
  });
});

