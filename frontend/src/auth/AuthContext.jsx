/**
 * React Context for Authentication and Role Management.
 * Restricts demo auto-login and client-side role switching to explicit mock mode.
 * In real API mode, authentication and authorization are strictly backend-driven.
 *
 * NOTE ON STAKEHOLDER MODEL:
 * Global account roles are strictly ATTENDEE and ORGANIZER.
 * COORDINATOR is an event-specific delegation verified live via MarqueEventStaff,
 * not a global account role.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, getUser, setToken, setUser, clearAuth } from './authHelpers';
import * as authService from '../services/authService';
import * as eventStaffService from '../services/eventStaffService';
import { isMockMode } from '../services/apiClient';

const AuthContext = createContext(null);

// Canonical demo personas for mock testing
const DEMO_PERSONAS = {
  ATTENDEE: {
    userId: 'usr-attendee-demo',
    email: 'chandrabhanu@example.com',
    name: 'Chandrabhanu Prusty',
    role: 'ATTENDEE',
  },
  ORGANIZER: {
    userId: 'usr-organizer-01',
    email: 'organizer.neilsen@example.com',
    name: 'Neilsen Organizer',
    role: 'ORGANIZER',
  },
  COORDINATOR: {
    userId: 'usr-coordinator-01',
    email: 'coordinator.preeti@example.com',
    name: 'Preeti Coordinator',
    role: 'ATTENDEE', // Retains ATTENDEE global role, but holds event staff assignments!
    hasAssignedEvents: true,
  },
};

export function AuthProvider({ children }) {
  const [user, setCurrentUser] = useState(null);
  const [token, setCurrentToken] = useState(null);
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUserAssignedEvents = async (authToken) => {
    if (!authToken) {
      setAssignedEvents([]);
      return;
    }
    try {
      const res = await eventStaffService.getAssignedEvents();
      setAssignedEvents(res.events || []);
    } catch {
      setAssignedEvents([]);
    }
  };

  useEffect(() => {
    // Rehydrate auth state on mount
    const savedToken = getToken();
    const savedUser = getUser();

    if (savedToken && savedUser) {
      setCurrentToken(savedToken);
      setCurrentUser(savedUser);
      fetchUserAssignedEvents(savedToken);

      // Silently refresh profile from backend to pick up any dynamic role changes in DynamoDB
      authService.getMe().then((res) => {
        if (res?.user && res.user.role !== savedUser.role) {
          setCurrentUser(res.user);
          setUser(res.user);
        }
      }).catch(() => {
        // Token expired or network issue, keep rehydrated user
      });
    } else {
      setCurrentToken(null);
      setCurrentUser(null);
      setAssignedEvents([]);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const data = await authService.login({ email, password });
    if (data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
      setCurrentToken(data.token);
      setCurrentUser(data.user);
      await fetchUserAssignedEvents(data.token);
    }
    return data;
  };

  const register = async (name, email, password) => {
    const data = await authService.register({ name, email, password });
    if (data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
      setCurrentToken(data.token);
      setCurrentUser(data.user);
      await fetchUserAssignedEvents(data.token);
    }
    return data;
  };

  const logout = () => {
    clearAuth();
    setCurrentToken(null);
    setCurrentUser(null);
    setAssignedEvents([]);
  };

  // Switch role for quick testing/grading across Attendee, Organizer, Coordinator in mock mode ONLY
  const switchRole = async (targetPersonaKey) => {
    if (!isMockMode) {
      console.warn(
        '[Marque Auth] Client-side role switching is restricted to mock mode. In real API mode, user roles are determined by backend authentication.'
      );
      return;
    }
    const persona = DEMO_PERSONAS[targetPersonaKey] || {
      userId: `usr-${Date.now().toString(36)}`,
      email: `${targetPersonaKey.toLowerCase()}@example.com`,
      name: `${targetPersonaKey} User`,
      role: targetPersonaKey === 'ORGANIZER' ? 'ORGANIZER' : 'ATTENDEE',
    };
    setUser(persona);
    setCurrentUser(persona);
    await fetchUserAssignedEvents(token);
  };

  const role = user?.role === 'ORGANIZER'
    ? 'ORGANIZER'
    : user?.role === 'COORDINATOR'
    ? 'COORDINATOR'
    : 'ATTENDEE';
  const isOrganizer = role === 'ORGANIZER';
  // Coordinator access: either global COORDINATOR role, or holds live event staff assignments!
  const hasStaffAssignments = assignedEvents.length > 0 || (isMockMode && user?.hasAssignedEvents);
  const isCoordinator = role === 'COORDINATOR' || hasStaffAssignments;
  const isAttendee = true; // All campus users have attendee privileges (browsing, RSVP, passes)

  const value = {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    role,
    isOrganizer,
    isCoordinator,
    isAttendee,
    assignedEvents,
    hasStaffAssignments,
    refreshAssignedEvents: () => fetchUserAssignedEvents(token),
    isMockMode,
    loading,
    login,
    register,
    logout,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
