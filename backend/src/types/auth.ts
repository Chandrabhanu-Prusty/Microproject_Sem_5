export type UserRole = 'ATTENDEE' | 'ORGANIZER' | 'COORDINATOR';

export interface UserProfile {
  userId: string;
  itemType: 'PROFILE';
  name: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserLockItem {
  userId: string; // "EMAIL#<normalizedEmail>"
  itemType: 'LOCK';
  ownerUserId: string;
  createdAt: string;
}

export interface BootstrapLockItem {
  userId: 'BOOTSTRAP#ORGANIZER';
  itemType: 'LOCK';
  promotedUserId: string;
  promotedEmail: string;
  createdAt: string;
}

export interface UserResponse {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: UserResponse;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface BootstrapResult {
  success: boolean;
  promotedUserId: string;
  email: string;
  role: 'ORGANIZER';
  message: string;
}

