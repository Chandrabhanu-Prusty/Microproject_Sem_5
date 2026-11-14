
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Camera,
  Search,
  CheckCircle2,
  XCircle,
  Ticket,
  UserCheck,
  Calendar,
  MapPin,
  ShieldAlert,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import * as checkinService from '../services/checkinService';
import * as eventStaffService from '../services/eventStaffService';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

export default function CoordinatorCheckinPage() {
  const { eventId: urlEventId } = useParams();
  const navigate = useNavigate();
  const { user, isCoordinator, isOrganizer, switchRole, isMockMode } = useAuth();

  const [assignedEvents, setAssignedEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(urlEventId || '');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState('CAMERA');
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [directTicketId, setDirectTicketId] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const [checkInResult, setCheckInResult] = useState(null);

  // Tracks successful check-ins during this page session.
  // The backend remains the source of truth for whether check-in succeeds.
  const [checkedInTicketIds, setCheckedInTicketIds] = useState(() => new Set());

  const playFeedbackSound = (type) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.28);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // Audio feedback is optional.
    }
  };

  const fetchAssignedEvents = async () => {
    try {
      setLoading(true);

      const res = await eventStaffService.getAssignedEvents();
      const list = res.events || [];

      setAssignedEvents(list);

      const targetId = urlEventId || (list.length > 0 ? list[0].eventId : '');
      setSelectedEventId(targetId);

      if (targetId) {
        const found = list.find(event => event.eventId === targetId);

        if (found) {
          setSelectedEvent(found);
          setAccessDenied(false);
        } else {
          setSelectedEvent(null);
          setAccessDenied(true);
        }
      } else {
        setSelectedEvent(null);
        setAccessDenied(false);
      }
    } catch (err) {
      console.error('Failed to load assigned events:', err);
      setAssignedEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedEvents();
  }, [user?.userId, urlEventId]);

  const handleSelectEvent = (id) => {
    setSelectedEventId(id);
    navigate(`/checkin/${id}`);

    const found = assignedEvents.find(event => event.eventId === id);

    if (found) {
      setSelectedEvent(found);
      setAccessDenied(false);
    } else {
      setSelectedEvent(null);
      setAccessDenied(true);
    }

    setCheckInResult(null);
    setSearchQuery('');
    setDirectTicketId('');
    setAttendees([]);
    setCheckedInTicketIds(new Set());
  };

  const searchAttendees = async (
    eventId,
    query,
    knownCheckedInIds = checkedInTicketIds
  ) => {
    if (!eventId) return;

    try {
      setAttendeesLoading(true);

      const res = await checkinService.getAttendees(eventId, query);

      const attendeeList = (res.attendees || []).map(attendee => {
        if (knownCheckedInIds.has(attendee.ticketId)) {
          return { ...attendee, status: 'CHECKED_IN' };
        }

        return attendee;
      });

      setAttendees(attendeeList);
    } catch (err) {
      console.error('Failed to search attendees:', err);
    } finally {
      setAttendeesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MANUAL' && selectedEventId && !accessDenied) {
      searchAttendees(selectedEventId, searchQuery);
    }
  }, [activeTab, selectedEventId, searchQuery, accessDenied]);

  const handleProcessCheckIn = async (ticketId) => {
    const normalizedTicketId = String(ticketId || '').trim();

    if (!normalizedTicketId || !selectedEventId || checkingIn) return;

    try {
      setCheckingIn(true);
      setCheckInResult(null);

      const res = await checkinService.checkInTicket(
        selectedEventId,
        normalizedTicketId
      );

      playFeedbackSound('success');

      const updatedCheckedInIds = new Set(checkedInTicketIds);
      updatedCheckedInIds.add(res.ticketId || normalizedTicketId);
      setCheckedInTicketIds(updatedCheckedInIds);

      setCheckInResult({
        success: true,
        ticketId: res.ticketId || normalizedTicketId,
        attendeeName: res.attendeeName,
        attendeeEmail: res.attendeeEmail,
        timestamp: res.checkedInAt || new Date().toISOString(),
        message: 'Attendee admission verified. Ticket marked as checked in.'
      });

      if (activeTab === 'MANUAL') {
        await searchAttendees(
          selectedEventId,
          searchQuery,
          updatedCheckedInIds
        );
      }
    } catch (err) {
      playFeedbackSound('error');

      setCheckInResult({
        success: false,
        ticketId: normalizedTicketId,
        code: err.code || 'CHECKIN_ERROR',
        message: err.message || 'Ticket could not be verified for this event.'
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const canCheckIn = (status) => {
    return status === 'CONFIRMED' || status === 'ACTIVE';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {selectedEventId && (
              <button
                onClick={() => {
                  setSelectedEventId('');
                  setSelectedEvent(null);
                  navigate('/checkin');
                }}
                className="btn btn-sm btn-ghost"
                style={{ padding: '0.2rem 0.4rem', color: 'var(--text-muted)' }}
                title="Back to assigned events list"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
              Venue Check-in Workspace
            </h2>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Scan QR codes or manually verify tickets for your assigned events.
          </p>
        </div>

        {assignedEvents.length > 0 && (
          <div style={{ minWidth: '240px' }}>
            <label
              className="form-label"
              style={{ fontSize: '0.6875rem', textTransform: 'uppercase' }}
            >
              Assigned Event
            </label>

            <select
              value={selectedEventId}
              onChange={(e) => handleSelectEvent(e.target.value)}
              className="form-select"
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.65rem' }}
            >
              {assignedEvents.map(event => (
                <option key={event.eventId} value={event.eventId}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Role notice */}
      {!isCoordinator && !isOrganizer && (
        <div style={{
          padding: '0.85rem 1.15rem',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(241, 109, 114, 0.12)',
          border: '1px solid rgba(241, 109, 114, 0.35)',
          color: 'var(--status-error)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.875rem' }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Access Denied:</strong> Attendees cannot access the check-in workspace.
            </span>
          </div>

          {isMockMode && (
            <button
              onClick={() => switchRole('COORDINATOR')}
              className="btn btn-sm btn-secondary"
              style={{ color: 'var(--status-error)', borderColor: 'rgba(241, 109, 114, 0.4)' }}
            >
              <UserCheck size={14} />
              <span>Switch to Coordinator Persona</span>
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <LoadingSpinner message="Checking assigned events and authorizations..." />
      ) : accessDenied ? (
        <div className="card" style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          border: '1px solid rgba(241, 109, 114, 0.4)'
        }}>
          <div style={{
            display: 'inline-flex',
            padding: '1rem',
            background: 'rgba(241, 109, 114, 0.1)',
            borderRadius: '50%',
            marginBottom: '1rem',
            color: 'var(--status-error)'
          }}>
            <ShieldAlert size={36} />
          </div>

          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            Not Assigned to This Event
          </h3>

          <p style={{
            color: 'var(--text-secondary)',
            maxWidth: '480px',
            margin: '0 auto 1.5rem',
            fontSize: '0.875rem'
          }}>
            You do not have check-in permissions for this event. Ask the event owner to assign you.
          </p>

          <button
            onClick={() => {
              if (assignedEvents.length > 0) {
                handleSelectEvent(assignedEvents[0].eventId);
              } else {
                navigate('/events');
              }
            }}
            className="btn btn-primary btn-sm"
          >
            {assignedEvents.length > 0 ? 'View Your Assigned Events' : 'Return to Events'}
          </button>
        </div>
      ) : assignedEvents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            padding: '1rem',
            background: 'var(--bg-card-subtle)',
            borderRadius: '50%',
            marginBottom: '1rem',
            color: 'var(--text-muted)'
          }}>
            <Calendar size={36} />
          </div>

          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            No Assigned Events
          </h3>

          <p style={{
            color: 'var(--text-secondary)',
            maxWidth: '440px',
            margin: '0 auto 1rem',
            fontSize: '0.875rem'
          }}>
            You currently have no events assigned for check-in duties.
          </p>

          <Link to="/events" className="btn btn-secondary btn-sm">
            Browse Campus Events
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Active Event */}
          {selectedEvent && (
            <div className="card" style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <span style={{
                  fontSize: '0.6875rem',
                  color: 'var(--accent-orange)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em'
                }}>
                  Active Check-in Session
                </span>

                <h3 style={{ fontSize: '1.15rem', marginTop: '0.15rem' }}>
                  {selectedEvent.title}
                </h3>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginTop: '0.35rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8125rem'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={13} style={{ color: 'var(--accent-pink)' }} />
                    {selectedEvent.venue}
                  </span>
                  <span>•</span>
                  <span>{selectedEvent.confirmedCount} Confirmed Attendees</span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                background: 'var(--bg-main)',
                padding: '0.25rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}>
                <button
                  onClick={() => setActiveTab('CAMERA')}
                  className={`btn btn-sm ${activeTab === 'CAMERA' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                >
                  <Camera size={14} />
                  <span>Camera Scanner</span>
                </button>

                <button
                  onClick={() => setActiveTab('MANUAL')}
                  className={`btn btn-sm ${activeTab === 'MANUAL' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                >
                  <Search size={14} />
                  <span>Manual Lookup</span>
                </button>
              </div>
            </div>
          )}

          {/* Check-in Result */}
          {checkInResult && (
            <div style={{
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-sm)',
              background: checkInResult.success ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
              border: `1px solid ${checkInResult.success ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
              color: checkInResult.success ? 'var(--status-success)' : 'var(--status-error)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              animation: 'fadeIn 0.2s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {checkInResult.success ? <CheckCircle2 size={24} /> : <XCircle size={24} />}

                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                    {checkInResult.success ? 'Check-in Verified!' : 'Check-in Failed'}
                  </div>

                  <div style={{
                    fontSize: '0.8125rem',
                    marginTop: '0.15rem',
                    color: 'var(--text-primary)'
                  }}>
                    {checkInResult.message}
                  </div>

                  {checkInResult.attendeeName && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginTop: '0.2rem'
                    }}>
                      Attendee: <strong>{checkInResult.attendeeName}</strong> ({checkInResult.attendeeEmail})
                    </div>
                  )}

                  {checkInResult.success && (
                    <div style={{
                      fontSize: '0.75rem',
                      marginTop: '0.2rem',
                      color: 'var(--text-secondary)'
                    }}>
                      Ticket: {checkInResult.ticketId}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setCheckInResult(null)}
                className="btn btn-sm btn-ghost"
                style={{ color: 'inherit' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Camera Scanner */}
          {activeTab === 'CAMERA' && (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                <QrScanner
                  onScanSuccess={handleProcessCheckIn}
                  onManualFallback={() => setActiveTab('MANUAL')}
                />
              </div>
            </div>
          )}

          {/* Manual Lookup */}
          {activeTab === 'MANUAL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Direct Ticket Entry */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem' }}>
                  Direct Ticket Code Check-in
                </h4>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Ticket size={16} style={{
                      position: 'absolute',
                      left: '0.85rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)'
                    }} />

                    <input
                      type="text"
                      placeholder="Enter ticket code"
                      value={directTicketId}
                      onChange={(e) => setDirectTicketId(e.target.value)}
                      className="form-input"
                      style={{ paddingLeft: '2.4rem' }}
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (directTicketId.trim()) {
                        handleProcessCheckIn(directTicketId.trim());
                        setDirectTicketId('');
                      }
                    }}
                    disabled={!directTicketId.trim() || checkingIn}
                    className="btn btn-primary"
                  >
                    {checkingIn ? 'Checking...' : 'Check In Ticket'}
                  </button>
                </div>
              </div>

              {/* Attendee Registry */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.9375rem' }}>Attendee Registry</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Search by attendee name, email, or ticket reference
                    </span>
                  </div>

                  <div className="search-box" style={{ width: '260px' }}>
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Search attendee..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-input"
                      style={{ padding: '0.4rem 0.75rem 0.4rem 2.2rem', fontSize: '0.8125rem' }}
                    />
                  </div>
                </div>

                {attendeesLoading ? (
                  <LoadingSpinner message="Searching attendee registry..." />
                ) : attendees.length === 0 ? (
                  <div style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem'
                  }}>
                    {searchQuery
                      ? 'No attendees match your search query.'
                      : 'No attendees found for this event.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {attendees.map(attendee => {
                      const alreadyCheckedIn = attendee.status === 'CHECKED_IN';
                      const eligible = canCheckIn(attendee.status);

                      return (
                        <div
                          key={attendee.ticketId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem 1rem',
                            background: 'var(--bg-main)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            gap: '1rem',
                            flexWrap: 'wrap'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                              {attendee.attendeeName}
                            </div>

                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {attendee.attendeeEmail}
                            </div>

                            <div style={{
                              color: 'var(--text-muted)',
                              fontSize: '0.6875rem',
                              fontFamily: 'monospace',
                              marginTop: '0.15rem'
                            }}>
                              {attendee.ticketId}
                            </div>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                          }}>
                            <StatusBadge status={attendee.status} />

                            {alreadyCheckedIn ? (
                              <span style={{
                                color: 'var(--status-success)',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}>
                                <CheckCircle2 size={14} style={{
                                  display: 'inline',
                                  verticalAlign: 'middle',
                                  marginRight: '0.25rem'
                                }} />
                                Checked In
                              </span>
                            ) : eligible ? (
                              <button
                                onClick={() => handleProcessCheckIn(attendee.ticketId)}
                                disabled={checkingIn}
                                className="btn btn-sm btn-primary"
                              >
                                {checkingIn ? 'Checking...' : 'Check In'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
