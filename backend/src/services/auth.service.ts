import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { UserRepository } from '../repositories/user.repository.js';
import type {
  AuthResponse,
  BootstrapResult,
  TokenPayload,
  UserResponse,
} from '../types/auth.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema.js';

const BCRYPT_SALT_ROUNDS = 10;

export class AuthService {
  private readonly userRepo: UserRepository;

  constructor(userRepo?: UserRepository) {
    this.userRepo = userRepo ?? new UserRepository();
  }

  /**
   * Registers a new user account.
   * Public registration strictly assigns role ATTENDEE.
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const userId = `usr-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const created = await this.userRepo.createWithEmailLock({
      userId,
      name: input.name.trim(),
      email: input.email.trim(),
      normalizedEmail,
      passwordHash,
      role: 'ATTENDEE', // Role is strictly ATTENDEE regardless of input
    });

    const token = this.generateToken({
      userId: created.userId,
      email: created.email,
      role: created.role,
    });

    return {
      token,
      user: {
        userId: created.userId,
        name: created.name,
        email: created.email,
        role: created.role,
      },
    };
  }

  /**
   * Authenticates user using normalized email and password verification.
   * Returns generic unauthorized error to prevent email harvesting.
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByNormalizedEmail(normalizedEmail);

    if (!user) {
      // Use generic error message to avoid revealing account existence
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    const token = this.generateToken({
      userId: user.userId,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Generates a signed JWT with minimal identity claims.
   */
  generateToken(payload: { userId: string; email: string; role: import('../types/auth.js').UserRole }): string {
    const env = getEnv();
    return jwt.sign(payload, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verifies a Bearer JWT and extracts the authenticated identity context.
   * Strictly enforces the HS256 signature algorithm.
   */
  verifyToken(token: string): TokenPayload {
    const env = getEnv();
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload & {
        userId?: string;
        email?: string;
        role?: string;
      };

      if (!decoded.userId || !decoded.email || !decoded.role) {
        throw new UnauthorizedError('Malformed token payload.');
      }

      if (decoded.role !== 'ATTENDEE' && decoded.role !== 'ORGANIZER' && decoded.role !== 'COORDINATOR') {
        throw new UnauthorizedError('Invalid role in token.');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role as import('../types/auth.js').UserRole,
        iat: decoded.iat,
        exp: decoded.exp,
      };
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired. Please sign in again.');
      }
      throw new UnauthorizedError('Invalid authentication token.');
    }
  }

  /**
   * Retrieves user profile by userId.
   */
  async getProfile(userId: string): Promise<UserResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User profile not found.');
    }

    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  /**
   * One-time atomic organizer bootstrap.
   * Requires configured BOOTSTRAP_SECRET and target account pre-registration.
   * Promotes the target user from ATTENDEE to ORGANIZER atomically.
   */
  async bootstrapOrganizer(email: string, secret: string): Promise<BootstrapResult> {
    const env = getEnv();

    // 1. Fail closed if BOOTSTRAP_SECRET is not configured or empty
    if (!env.BOOTSTRAP_SECRET) {
      throw new ForbiddenError(
        'Organizer bootstrap is disabled because BOOTSTRAP_SECRET is not configured in environment.',
        'BOOTSTRAP_DISABLED'
      );
    }

    // 2. Validate secret
    if (secret !== env.BOOTSTRAP_SECRET) {
      throw new ForbiddenError('Supplied bootstrap secret is invalid.', 'INVALID_BOOTSTRAP_SECRET');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 3. Verify target account exists
    const targetUser = await this.userRepo.findByNormalizedEmail(normalizedEmail);
    if (!targetUser) {
      throw new NotFoundError(
        'USER_NOT_FOUND',
        'Target user must be registered as an ATTENDEE before organizer bootstrap.'
      );
    }

    // 4. Verify target account is currently an attendee
    if (targetUser.role === 'ORGANIZER') {
      throw new ConflictError(
        'ALREADY_ORGANIZER',
        'The specified account is already an ORGANIZER.'
      );
    }

    // 5. Execute atomic TransactWriteItems (Bootstrap Lock + Profile update)
    await this.userRepo.executeBootstrapPromotion(targetUser.userId, targetUser.email);

    return {
      success: true,
      promotedUserId: targetUser.userId,
      email: targetUser.email,
      role: 'ORGANIZER',
      message: 'Organizer bootstrap successfully executed.',
    };
  }
}
