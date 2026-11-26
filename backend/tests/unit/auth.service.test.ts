import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/services/auth.service.js';
import { UserRepository } from '../../src/repositories/user.repository.js';
import { getEnv, resetEnvCache } from '../../src/config/env.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/utils/errors.js';
import type { UserProfile } from '../../src/types/auth.js';

const testEnv = {
  USERS_TABLE: 'MarqueUsers',
  EVENTS_TABLE: 'MarqueEvents',
  EVENT_STAFF_TABLE: 'MarqueEventStaff',
  RSVPS_TABLE: 'MarqueRSVPs',
  WAITLIST_TABLE: 'MarqueWaitlist',
  TICKETS_TABLE: 'MarqueTickets',
  S3_BUCKET: 'actual-s3-bucket-name',
  JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars-long',
  BOOTSTRAP_SECRET: 'bootstrap-secret-16',
};

describe('AuthService Unit Tests', () => {
  test('register hashes password with bcrypt and enforces ATTENDEE role', async () => {
    resetEnvCache();
    getEnv(testEnv);

    let savedUser: any = null;
    const mockRepo = {
      createWithEmailLock: async (user: any) => {
        savedUser = user;
        return {
          ...user,
          itemType: 'PROFILE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
    } as unknown as UserRepository;

    const authService = new AuthService(mockRepo);
    const result = await authService.register({
      name: '  Aarav Sharma  ',
      email: '  AARAV.SHARMA@VESIT.EDU  ',
      password: 'StrongPassword123!',
      role: 'ORGANIZER' as any, // Attacker attempts to register as ORGANIZER
    });

    // Verify role was forced to ATTENDEE
    assert.equal(savedUser.role, 'ATTENDEE');
    assert.equal(result.user.role, 'ATTENDEE');

    // Verify email was normalized
    assert.equal(savedUser.normalizedEmail, 'aarav.sharma@vesit.edu');
    assert.equal(savedUser.name, 'Aarav Sharma');

    // Verify password was hashed (not plaintext)
    assert.notEqual(savedUser.passwordHash, 'StrongPassword123!');
    const isMatch = await bcrypt.compare('StrongPassword123!', savedUser.passwordHash);
    assert.equal(isMatch, true);

    // Verify response does not leak password hash
    assert.equal((result.user as any).passwordHash, undefined);
    assert.equal(typeof result.token, 'string');
  });

  test('login succeeds with normalized email and valid password', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
    const mockProfile: UserProfile = {
      userId: 'usr-12345',
      itemType: 'PROFILE',
      name: 'Priya Patel',
      email: 'priya@vesit.edu',
      normalizedEmail: 'priya@vesit.edu',
      passwordHash,
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockRepo = {
      findByNormalizedEmail: async (email: string) => {
        if (email === 'priya@vesit.edu') return mockProfile;
        return null;
      },
    } as unknown as UserRepository;

    const authService = new AuthService(mockRepo);
    const result = await authService.login({
      email: '  PRIYA@VESIT.EDU  ',
      password: 'CorrectPassword123!',
    });

    assert.equal(result.user.userId, 'usr-12345');
    assert.equal(result.user.email, 'priya@vesit.edu');
    assert.equal(result.user.role, 'ATTENDEE');

    // Token verifies correctly
    const decoded = authService.verifyToken(result.token);
    assert.equal(decoded.userId, 'usr-12345');
    assert.equal(decoded.email, 'priya@vesit.edu');
    assert.equal(decoded.role, 'ATTENDEE');
  });

  test('login fails with generic error when user is not found', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockRepo = {
      findByNormalizedEmail: async () => null,
    } as unknown as UserRepository;

    const authService = new AuthService(mockRepo);
    await assert.rejects(
      async () => {
        await authService.login({
          email: 'nonexistent@vesit.edu',
          password: 'SomePassword123!',
        });
      },
      (err: any) => {
        assert.equal(err instanceof UnauthorizedError, true);
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.message, 'Invalid email or password.');
        return true;
      }
    );
  });

  test('login fails with generic error when password is wrong', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
    const mockProfile: UserProfile = {
      userId: 'usr-12345',
      itemType: 'PROFILE',
      name: 'Priya Patel',
      email: 'priya@vesit.edu',
      normalizedEmail: 'priya@vesit.edu',
      passwordHash,
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockRepo = {
      findByNormalizedEmail: async () => mockProfile,
    } as unknown as UserRepository;

    const authService = new AuthService(mockRepo);
    await assert.rejects(
      async () => {
        await authService.login({
          email: 'priya@vesit.edu',
          password: 'WrongPassword!',
        });
      },
      (err: any) => {
        assert.equal(err instanceof UnauthorizedError, true);
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, 'INVALID_CREDENTIALS');
        assert.equal(err.message, 'Invalid email or password.');
        return true;
      }
    );
  });

  test('verifyToken rejects expired or forged tokens', () => {
    resetEnvCache();
    getEnv(testEnv);

    const authService = new AuthService({} as any);

    // Forged with wrong secret
    const forgedToken = jwt.sign(
      { userId: 'usr-1', email: 'test@vesit.edu', role: 'ATTENDEE' },
      'wrong-secret-key-32-chars-length-long'
    );
    assert.throws(() => authService.verifyToken(forgedToken), (err: any) => {
      assert.equal(err instanceof UnauthorizedError, true);
      assert.equal(err.message, 'Invalid authentication token.');
      return true;
    });

    // Expired token
    const expiredToken = jwt.sign(
      { userId: 'usr-1', email: 'test@vesit.edu', role: 'ATTENDEE' },
      testEnv.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    assert.throws(() => authService.verifyToken(expiredToken), (err: any) => {
      assert.equal(err instanceof UnauthorizedError, true);
      assert.equal(err.message, 'Token expired. Please sign in again.');
      return true;
    });

    // Valid COORDINATOR token verification
    const coordinatorToken = jwt.sign(
      { userId: 'usr-coord', email: 'coord@vesit.edu', role: 'COORDINATOR' },
      testEnv.JWT_SECRET
    );
    const verifiedCoord = authService.verifyToken(coordinatorToken);
    assert.equal(verifiedCoord.role, 'COORDINATOR');

    // Invalid role in payload
    const invalidRoleToken = jwt.sign(
      { userId: 'usr-1', email: 'test@vesit.edu', role: 'SUPER_ADMIN' },
      testEnv.JWT_SECRET
    );
    assert.throws(() => authService.verifyToken(invalidRoleToken), (err: any) => {
      assert.equal(err instanceof UnauthorizedError, true);
      assert.equal(err.message, 'Invalid role in token.');
      return true;
    });

    // Rejects token signed with disallowed algorithm (e.g. 'none')
    const noneAlgToken = jwt.sign(
      { userId: 'usr-1', email: 'test@vesit.edu', role: 'ATTENDEE' },
      '',
      { algorithm: 'none' }
    );
    assert.throws(() => authService.verifyToken(noneAlgToken), (err: any) => {
      assert.equal(err instanceof UnauthorizedError, true);
      return true;
    });
  });

  test('getProfile returns user and never leaks password hash', async () => {
    resetEnvCache();
    getEnv(testEnv);

    const mockProfile: UserProfile = {
      userId: 'usr-12345',
      itemType: 'PROFILE',
      name: 'Rohan Mehra',
      email: 'rohan@vesit.edu',
      normalizedEmail: 'rohan@vesit.edu',
      passwordHash: 'secret_hash',
      role: 'ATTENDEE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockRepo = {
      findById: async (id: string) => (id === 'usr-12345' ? mockProfile : null),
    } as unknown as UserRepository;

    const authService = new AuthService(mockRepo);
    const profile = await authService.getProfile('usr-12345');
    assert.equal(profile.userId, 'usr-12345');
    assert.equal(profile.name, 'Rohan Mehra');
    assert.equal((profile as any).passwordHash, undefined);

    await assert.rejects(async () => {
      await authService.getProfile('non-existent');
    }, NotFoundError);
  });

  describe('Organizer Bootstrap in AuthService', () => {
    test('fails closed when BOOTSTRAP_SECRET is absent or empty', async () => {
      resetEnvCache();
      getEnv({ ...testEnv, BOOTSTRAP_SECRET: '' });

      const authService = new AuthService({} as any);
      await assert.rejects(
        async () => {
          await authService.bootstrapOrganizer('admin@vesit.edu', 'some-secret');
        },
        (err: any) => {
          assert.equal(err instanceof ForbiddenError, true);
          assert.match(err.message, /BOOTSTRAP_SECRET is not configured/);
          return true;
        }
      );
    });

    test('rejects invalid bootstrap secret', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const authService = new AuthService({} as any);
      await assert.rejects(
        async () => {
          await authService.bootstrapOrganizer('admin@vesit.edu', 'wrong-secret-12345');
        },
        (err: any) => {
          assert.equal(err instanceof ForbiddenError, true);
          assert.equal(err.message, 'Supplied bootstrap secret is invalid.');
          return true;
        }
      );
    });

    test('rejects bootstrap when target user is not registered', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const mockRepo = {
        findByNormalizedEmail: async () => null,
      } as unknown as UserRepository;

      const authService = new AuthService(mockRepo);
      await assert.rejects(
        async () => {
          await authService.bootstrapOrganizer('unregistered@vesit.edu', testEnv.BOOTSTRAP_SECRET);
        },
        (err: any) => {
          assert.equal(err instanceof NotFoundError, true);
          assert.equal(err.code, 'USER_NOT_FOUND');
          return true;
        }
      );
    });

    test('rejects bootstrap when target user is already an organizer', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const existingOrganizer: UserProfile = {
        userId: 'usr-org-01',
        itemType: 'PROFILE',
        name: 'Existing Org',
        email: 'org@vesit.edu',
        normalizedEmail: 'org@vesit.edu',
        passwordHash: 'hash',
        role: 'ORGANIZER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockRepo = {
        findByNormalizedEmail: async () => existingOrganizer,
      } as unknown as UserRepository;

      const authService = new AuthService(mockRepo);
      await assert.rejects(
        async () => {
          await authService.bootstrapOrganizer('org@vesit.edu', testEnv.BOOTSTRAP_SECRET);
        },
        (err: any) => {
          assert.equal(err instanceof ConflictError, true);
          assert.equal(err.code, 'ALREADY_ORGANIZER');
          return true;
        }
      );
    });

    test('successfully executes atomic organizer promotion', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const targetAttendee: UserProfile = {
        userId: 'usr-attendee-01',
        itemType: 'PROFILE',
        name: 'Lead Student',
        email: 'lead@vesit.edu',
        normalizedEmail: 'lead@vesit.edu',
        passwordHash: 'hash',
        role: 'ATTENDEE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let executedPromotion = false;
      const mockRepo = {
        findByNormalizedEmail: async () => targetAttendee,
        executeBootstrapPromotion: async (uid: string, email: string) => {
          if (uid === 'usr-attendee-01' && email === 'lead@vesit.edu') {
            executedPromotion = true;
          }
        },
      } as unknown as UserRepository;

      const authService = new AuthService(mockRepo);
      const result = await authService.bootstrapOrganizer('lead@vesit.edu', testEnv.BOOTSTRAP_SECRET);

      assert.equal(executedPromotion, true);
      assert.equal(result.success, true);
      assert.equal(result.promotedUserId, 'usr-attendee-01');
      assert.equal(result.role, 'ORGANIZER');
    });

    test('concurrency: simultaneous bootstrap attempts result in exactly one winner and one conflict failure', async () => {
      resetEnvCache();
      getEnv(testEnv);

      const targetAttendee: UserProfile = {
        userId: 'usr-attendee-01',
        itemType: 'PROFILE',
        name: 'Lead Student',
        email: 'lead@vesit.edu',
        normalizedEmail: 'lead@vesit.edu',
        passwordHash: 'hash',
        role: 'ATTENDEE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let lockAcquired = false;
      const mockRepo = {
        findByNormalizedEmail: async () => targetAttendee,
        executeBootstrapPromotion: async () => {
          // Atomic check-and-set simulation representing DynamoDB TransactWriteItems condition
          if (lockAcquired) {
            throw new ConflictError(
              'BOOTSTRAP_ALREADY_COMPLETED',
              'Organizer bootstrap has already been executed. Only one organizer can be provisioned through this mechanism.'
            );
          }
          lockAcquired = true;
        },
      } as unknown as UserRepository;

      const authService = new AuthService(mockRepo);

      // Trigger simultaneous execution
      const results = await Promise.allSettled([
        authService.bootstrapOrganizer('lead@vesit.edu', testEnv.BOOTSTRAP_SECRET),
        authService.bootstrapOrganizer('lead@vesit.edu', testEnv.BOOTSTRAP_SECRET),
      ]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      assert.equal(successes.length, 1);
      assert.equal(failures.length, 1);

      const winner = (successes[0] as PromiseFulfilledResult<any>).value;
      assert.equal(winner.success, true);
      assert.equal(winner.role, 'ORGANIZER');

      const loserError = (failures[0] as PromiseRejectedResult).reason;
      assert.equal(loserError.code, 'BOOTSTRAP_ALREADY_COMPLETED');
      assert.equal(loserError.statusCode, 409);
    });
  });
});

