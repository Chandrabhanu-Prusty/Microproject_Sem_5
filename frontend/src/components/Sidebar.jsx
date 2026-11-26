import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Ticket, 
  Layers, 
  QrCode, 
  HelpCircle, 
  LogOut, 
  LogIn, 
  UserCheck,
  X
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function Sidebar({ isOpen, onClose, onOpenHelp }) {
  const { user, isAuthenticated, role, isOrganizer, isCoordinator, logout, switchRole, isMockMode } = useAuth();
  const navigate = useNavigate();

  const handleRoleChange = (e) => {
    switchRole(e.target.value);
  };

  const navContent = (
    <>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <Link to="/events" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div className="brand-emblem">M</div>
          <span className="brand-wordmark">Marque</span>
        </Link>
        <span className="brand-tag">Campus</span>
        {isOpen && (
          <button onClick={onClose} aria-label="Close sidebar" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="sidebar-nav">
        <span className="sidebar-section-title">Navigation</span>

        {/* Available to all authenticated users */}
        <NavLink 
          to="/events" 
          onClick={onClose}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Calendar size={17} />
          <span>Discover Events</span>
        </NavLink>

        <NavLink 
          to="/my-registrations" 
          onClick={onClose}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Ticket size={17} />
          <span>My RSVPs</span>
        </NavLink>

        {/* Management & Staff Navigation - ONLY visible to authorized roles, NEVER pure attendees */}
        {(isOrganizer || isCoordinator) && (
          <>
            <span className="sidebar-section-title" style={{ marginTop: '0.5rem' }}>Management</span>

            {/* Organizer Only: Manage Events */}
            {isOrganizer && (
              <NavLink 
                to="/organizer" 
                onClick={onClose}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Layers size={17} />
                <span>Manage Events</span>
              </NavLink>
            )}

            {/* Event Check-in: Only users with live assigned events (Coordinator delegation) */}
            {isCoordinator && (
              <NavLink 
                to="/checkin" 
                onClick={onClose}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <QrCode size={17} />
                <span>Check-in Workspace</span>
              </NavLink>
            )}
          </>
        )}

        <div className="sidebar-divider" />

        <button 
          type="button" 
          onClick={() => {
            if (onClose) onClose();
            if (onOpenHelp) onOpenHelp();
          }}
          className="sidebar-link"
          style={{ width: '100%', textAlign: 'left' }}
        >
          <HelpCircle size={17} />
          <span>Help & Guide</span>
        </button>
      </nav>

      {/* Footer / User Profile & Role Switcher */}
      <div className="sidebar-footer">
        {isAuthenticated ? (
          <>
            <div className="sidebar-user-card">
              <div className="user-avatar-circle">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user?.name || 'Campus Attendee'}</span>
                <span className="sidebar-user-role">
                  {role === 'COORDINATOR' ? 'COORDINATOR' : role}{isCoordinator && role === 'ATTENDEE' ? ' (Staff)' : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  logout();
                  navigate('/auth');
                  if (onClose) onClose();
                }}
                className="btn btn-ghost btn-sm"
                title="Sign out"
                style={{ padding: '0.3rem' }}
              >
                <LogOut size={16} />
              </button>
            </div>

            {/* Quick Demo Persona Switcher (Mock Mode ONLY for testing & grading) */}
            {isMockMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'var(--bg-main)', padding: '0.45rem 0.6rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--accent-orange)', textTransform: 'uppercase' }}>
                  <UserCheck size={12} />
                  <span>Demo Persona</span>
                </div>
                <select
                  value={isOrganizer ? 'ORGANIZER' : isCoordinator ? 'COORDINATOR' : 'ATTENDEE'}
                  onChange={handleRoleChange}
                  aria-label="Demo Persona Switcher"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="ATTENDEE" style={{ background: '#1B1D24', color: '#fff' }}>Attendee (Chandrabhanu)</option>
                  <option value="ORGANIZER" style={{ background: '#1B1D24', color: '#fff' }}>Organizer (Neilsen)</option>
                  <option value="COORDINATOR" style={{ background: '#1B1D24', color: '#fff' }}>Coordinator (Preeti - Assigned)</option>
                </select>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Link
              to="/auth"
              onClick={onClose}
              className="btn btn-primary btn-sm"
              style={{ width: '100%' }}
            >
              <LogIn size={14} />
              <span>Sign In / Register</span>
            </Link>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="app-sidebar" aria-label="Main Navigation">
        {navContent}
      </aside>

      {/* Mobile Drawer (visible when isOpen is true) */}
      {isOpen && (
        <div className="mobile-overlay" onClick={onClose}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
