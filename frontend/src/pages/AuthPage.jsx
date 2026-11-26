import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Ticket,
  Calendar, 
  QrCode, 
  CheckCircle2, 
  AlertCircle,
  Info,
  Sparkles
} from 'lucide-react';

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register, isMockMode } = useAuth();

  // Mode: login vs register
  const initialMode = location.state?.mode === 'register' || location.search.includes('mode=register');
  const [isRegister, setIsRegister] = useState(initialMode);

  // Form inputs
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Stakeholder type indication: 'ATTENDEE' | 'ORGANIZER' | 'COORDINATOR'
  const [stakeholderType, setStakeholderType] = useState('ATTENDEE');

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  const returnUrl = location.state?.from || '/events';

  useEffect(() => {
    setErrorMessage(null);
    setSuccessNotice(null);
  }, [isRegister]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    // Form validations
    if (isRegister) {
      if (!name.trim()) {
        setErrorMessage('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify your password entry.');
        return;
      }
    }

    setLoading(true);

    try {
      if (isRegister) {
        // Conforms strictly to API_CONTRACT.md and SECURITY.md:
        // Public registration always creates an ATTENDEE account.
        // Role is NEVER sent in the public registration request.
        const res = await register(name.trim(), email.trim(), password);

        // Account is active with Attendee role
        if (stakeholderType !== 'ATTENDEE') {
          setSuccessNotice(
            `Account created! Note that public registration grants Attendee access by default (${res.user?.role || 'ATTENDEE'}). Privileged Organizer or Coordinator access requires separate campus administrator approval.`
          );
          setTimeout(() => {
            navigate(returnUrl);
          }, 2200);
          return;
        }

        navigate(returnUrl);
      } else {
        const res = await login(email.trim(), password);
        if (location.state?.from) {
          navigate(location.state.from);
        } else if (res?.user?.role === 'ORGANIZER') {
          navigate('/organizer');
        } else if (email.toLowerCase().includes('coordinator') || res?.user?.email?.toLowerCase().includes('coordinator')) {
          navigate('/checkin');
        } else {
          navigate('/events');
        }
      }
    } catch (err) {
      console.error('Authentication failure:', err);
      if (err.code === 'NETWORK_ERROR') {
        setErrorMessage(
          'Unable to reach the campus authentication service. Please check your network connection or backend API deployment.'
        );
      } else if (err.code === 'CONFIG_ERROR') {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(
          err.message || (isRegister ? 'Registration failed. Please try again.' : 'Invalid email or password.')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (role) => {
    if (role === 'ATTENDEE') {
      setEmail('chandrabhanu@example.com');
      setPassword('StrongPassword123!');
      setConfirmPassword('StrongPassword123!');
      setName('Chandrabhanu Prusty');
      setStakeholderType('ATTENDEE');
    } else if (role === 'ORGANIZER') {
      setEmail('organizer.neilsen@example.com');
      setPassword('StrongPassword123!');
      setConfirmPassword('StrongPassword123!');
      setName('Neilsen Organizer');
      setStakeholderType('ORGANIZER');
    } else if (role === 'COORDINATOR') {
      setEmail('coordinator.preeti@example.com');
      setPassword('StrongPassword123!');
      setConfirmPassword('StrongPassword123!');
      setName('Preeti Coordinator');
      setStakeholderType('COORDINATOR');
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '1rem auto 3rem', padding: '0 0.5rem' }}>
      <div className="card" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="brand-emblem" style={{ margin: '0 auto 0.75rem', width: '38px', height: '38px', fontSize: '1.25rem' }}>
            M
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>
            {isRegister ? 'Create Your Campus Account' : 'Sign in to Marque'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
            {isRegister 
              ? 'Reserve free event tickets, join waitlists, and access digital passes.' 
              : 'Enter your campus credentials to access your registrations.'}
          </p>
        </div>

        {/* Tab switcher: Sign in vs Register */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', background: '#14151B', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            className={`btn btn-sm ${!isRegister ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontWeight: !isRegister ? 700 : 500 }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            className={`btn btn-sm ${isRegister ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontWeight: isRegister ? 700 : 500 }}
          >
            Create Account
          </button>
        </div>

        {/* Quick Demo Credentials in Mock Mode ONLY */}
        {isMockMode && (
          <div style={{ marginBottom: '1.25rem', background: '#14151B', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--accent-orange)', textTransform: 'uppercase', marginBottom: '0.45rem' }}>
              <Sparkles size={12} />
              <span>Mock Mode Demo Personas</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setDemoCredentials('ATTENDEE')}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.6875rem', padding: '0.3rem' }}
              >
                Attendee
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials('ORGANIZER')}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.6875rem', padding: '0.3rem' }}
              >
                Organizer
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials('COORDINATOR')}
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.6875rem', padding: '0.3rem' }}
              >
                Coordinator
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div style={{ marginBottom: '1.15rem', padding: '0.75rem 0.85rem', background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)', borderRadius: 'var(--radius-sm)', color: 'var(--status-error)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div style={{ marginBottom: '1.15rem', padding: '0.75rem 0.85rem', background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)', borderRadius: 'var(--radius-sm)', color: 'var(--status-success)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {isRegister && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Full Name *</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="e.g. Chandrabhanu Prusty"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.35rem' }}
                  required={isRegister}
                />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email Address *</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                placeholder="name@ves.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.35rem' }}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password *</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.35rem', paddingRight: '2.35rem' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Confirm Password *</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.35rem', paddingRight: '2.35rem' }}
                  required={isRegister}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Stakeholder Selection: "How will you use Marque?" */}
          {isRegister && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="form-label">How will you use Marque?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {/* Option 1: Attendee */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: stakeholderType === 'ATTENDEE' ? '#14151B' : 'transparent',
                    border: `1px solid ${stakeholderType === 'ATTENDEE' ? 'var(--accent-pink)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <input
                    type="radio"
                    name="stakeholder"
                    value="ATTENDEE"
                    checked={stakeholderType === 'ATTENDEE'}
                    onChange={() => setStakeholderType('ATTENDEE')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Attendee
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Discover campus events and reserve free seats.
                    </div>
                  </div>
                </label>

                {/* Option 2: Event Organizer */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: stakeholderType === 'ORGANIZER' ? '#14151B' : 'transparent',
                    border: `1px solid ${stakeholderType === 'ORGANIZER' ? 'var(--accent-pink)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <input
                    type="radio"
                    name="stakeholder"
                    value="ORGANIZER"
                    checked={stakeholderType === 'ORGANIZER'}
                    onChange={() => setStakeholderType('ORGANIZER')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Event Organizer
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Create and manage campus events.
                    </div>
                  </div>
                </label>

                {/* Option 3: Event Coordinator */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: stakeholderType === 'COORDINATOR' ? '#14151B' : 'transparent',
                    border: `1px solid ${stakeholderType === 'COORDINATOR' ? 'var(--accent-pink)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <input
                    type="radio"
                    name="stakeholder"
                    value="COORDINATOR"
                    checked={stakeholderType === 'COORDINATOR'}
                    onChange={() => setStakeholderType('COORDINATOR')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Event Coordinator
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Manage event check-in and verify ticket scans.
                    </div>
                  </div>
                </label>
              </div>

              {/* Informative Security Explanation */}
              {stakeholderType !== 'ATTENDEE' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', fontSize: '0.72rem', color: 'var(--text-secondary)', background: '#14151B', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                  <Info size={14} style={{ color: 'var(--accent-orange)', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    New accounts receive Attendee access by default. Organizer or Coordinator permissions require separate campus administrative approval.
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Authenticating...' : isRegister ? 'Register Free' : 'Sign In'}
            <ArrowRight size={15} />
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button 
                type="button" 
                onClick={() => setIsRegister(false)}
                style={{ color: 'var(--accent-pink)', fontWeight: 600 }}
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Don't have an account?{' '}
              <button 
                type="button" 
                onClick={() => setIsRegister(true)}
                style={{ color: 'var(--accent-pink)', fontWeight: 600 }}
              >
                Create Account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
