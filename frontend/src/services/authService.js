/**
 * Authentication API Service
 * Conforms to API_CONTRACT.md
 */

import { apiRequest } from './apiClient';

export async function login({ email, password }) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register({ name, email, password }) {
  // Role is not sent in body (backend defaults to ATTENDEE)
  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function getMe() {
  return apiRequest('/api/auth/me');
}
