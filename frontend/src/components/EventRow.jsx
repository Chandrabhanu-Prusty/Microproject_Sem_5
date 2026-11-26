import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users, ArrowRight, Eye, Edit3, BarChart3, Clock, CheckCircle, UserCheck } from 'lucide-react';
import CapacityBar from './CapacityBar';
import StatusBadge from './StatusBadge';

export default function EventRow({ 
  event, 
  variant = 'attendee', // 'attendee' | 'organizer'
  onEdit, 
  onViewStats, 
  onViewAttendees,
  onManageStaff
}) {
  if (!event) return null;

  const isFull = event.confirmedCount >= event.capacity;
  const defaultBanner = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80';

  const formattedDate = event.startAt
    ? new Date(event.startAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'TBA';

  return (
    <article className="event-row" aria-labelledby={`event-title-${event.eventId}`}>
      {/* Left Column: Metadata & Actions */}
      <div className="event-row-left">
        <div>
          {/* Header Row: Category, Free Badge, Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
            <span className="category-pill">{event.category || 'General'}</span>
            <span className="tag-free">Free RSVP</span>
            <StatusBadge status={isFull ? 'WAITLISTED' : 'PUBLISHED'} />
            {variant === 'organizer' && event.status && (
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Status: {event.status}
              </span>
            )}
          </div>

          {/* Event Title */}
          <h3 id={`event-title-${event.eventId}`} className="event-row-title">
            <Link to={`/events/${event.eventId}`}>
              {event.title}
            </Link>
          </h3>
        </div>

        {/* Metadata: Date, Venue, Capacity */}
        <div className="event-meta-list">
          <div className="event-meta-item">
            <Calendar size={14} style={{ color: 'var(--accent-pink)' }} />
            <span>{formattedDate}</span>
          </div>

          <div className="event-meta-item">
            <MapPin size={14} style={{ color: 'var(--accent-orange)' }} />
            <span>{event.venue || 'Campus Venue'}</span>
          </div>

          <div className="event-meta-item" style={{ minWidth: '180px' }}>
            <CapacityBar confirmed={event.confirmedCount} capacity={event.capacity} />
          </div>
        </div>

        {/* Action Row */}
        <div className="event-row-actions">
          {variant === 'attendee' ? (
            <>
              <Link 
                to={`/events/${event.eventId}`} 
                className="btn btn-sm btn-secondary"
              >
                <Eye size={14} />
                <span>View Event</span>
              </Link>

              <Link 
                to={`/events/${event.eventId}`} 
                className={`btn btn-sm ${isFull ? 'btn-outline' : 'btn-primary'}`}
              >
                {isFull ? <Clock size={14} /> : <CheckCircle size={14} />}
                <span>{isFull ? 'Join Waitlist' : 'RSVP Free'}</span>
                <ArrowRight size={13} />
              </Link>
            </>
          ) : (
            /* Organizer Actions: Edit, View Event, Attendees, Analytics, Coordinators */
            <>
              <button 
                onClick={() => onEdit && onEdit(event)}
                className="btn btn-sm btn-secondary"
                title="Edit Event"
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>

              <Link 
                to={`/events/${event.eventId}`} 
                className="btn btn-sm btn-outline"
                title="View Public Page"
              >
                <Eye size={13} />
                <span>View</span>
              </Link>

              <button 
                onClick={() => onViewAttendees && onViewAttendees(event)}
                className="btn btn-sm btn-secondary"
                title="View Attendee Registry"
              >
                <Users size={13} />
                <span>Attendees</span>
              </button>

              <button 
                onClick={() => onManageStaff && onManageStaff(event)}
                className="btn btn-sm btn-secondary"
                title="Assign / Manage Coordinators"
              >
                <UserCheck size={13} />
                <span>Coordinators</span>
              </button>

              <button 
                onClick={() => onViewStats && onViewStats(event)}
                className="btn btn-sm btn-primary"
                title="View Statistics & Analytics"
              >
                <BarChart3 size={13} />
                <span>Analytics</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right Column: Event Banner (GDG Layout) */}
      <div className="event-row-banner">
        <img 
          src={event.bannerUrl || defaultBanner} 
          alt={event.title}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = defaultBanner;
          }}
        />
      </div>
    </article>
  );
}
