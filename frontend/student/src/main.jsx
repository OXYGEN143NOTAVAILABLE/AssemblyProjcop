import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './student.css';

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.detail?.error || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function ActivityCard({ activity }) {
  const date = activity.createdAt
    ? new Date(activity.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const completed = activity.status === 'completed';

  return (
    <a className="activity-card" href={`/simulator?scenario=${encodeURIComponent(activity.id)}`}>
      <div className="activity-card-top">
        <span className="activity-icon" aria-hidden="true">PC</span>
        <span className={`activity-status ${completed ? 'complete' : ''}`}>
          {completed ? 'Completed' : 'Ready to start'}
        </span>
      </div>
      <h3>{activity.title}</h3>
      <p className="activity-description">
        {activity.description || 'An assembly activity created by your instructor.'}
      </p>
      <div className="activity-meta">
        <span>{activity.activityType || 'PC build'}</span>
        {activity.tier && <span>{activity.tier}</span>}
        {activity.timeLimitMinutes && <span>{activity.timeLimitMinutes} min</span>}
      </div>
      <div className="activity-card-footer">
        <span className="instructor-name">By {activity.instructor?.displayName || 'Your instructor'}</span>
        {completed && activity.completion?.score != null
          ? <span className="completion-score">{activity.completion.score}%</span>
          : <span className="launch-label">Open simulation <span aria-hidden="true">→</span></span>}
        {date && !completed && <span className="activity-date">{date}</span>}
      </div>
    </a>
  );
}

function Dashboard({ user, onSignOut }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/student/activities')
      .then((data) => {
        if (active) setActivities(data.activities);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const completedCount = activities.filter((activity) => activity.status === 'completed').length;
  const initials = (user.displayName || 'Student')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Assembly PC home">
          <span className="brand-mark">PC</span>
          <span>Assembly <b>PC</b></span>
        </a>
        <div className="topbar-actions">
          <a className="simulator-link" href="/simulator">Open simulator</a>
          <button className="account-button" type="button" onClick={onSignOut}>
            <span className="avatar">{initials || 'S'}</span>
            <span className="account-name">{user.displayName || 'Student'}<small>Student</small></span>
            <span className="signout-label">Sign out</span>
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="sidebar">
          <p className="nav-caption">Workspace</p>
          <a className="nav-item active" href="/student/dashboard"><span aria-hidden="true">▦</span> Dashboard</a>
          <a className="nav-item" href="#activities"><span aria-hidden="true">▣</span> My activities</a>
          <div className="sidebar-bottom">
            <div className="help-card">
              <span className="help-mark" aria-hidden="true">?</span>
              <strong>Need a hand?</strong>
              <p>Ask your instructor if you need help with an activity.</p>
            </div>
          </div>
        </aside>

        <main className="dashboard-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">Student dashboard</p>
              <h1>Hi, {(user.displayName || 'Student').trim().split(/\s+/)[0]} <span aria-hidden="true">👋</span></h1>
              <p className="muted">Pick up where you left off or start a new instructor activity.</p>
            </div>
            <a className="primary-button" href="#activities">View activities <span aria-hidden="true">→</span></a>
          </section>

          <section className="summary-grid" aria-label="Activity summary">
            <article className="summary-card">
              <span className="summary-symbol">▣</span>
              <div><span className="summary-label">Assigned activities</span><strong>{loading || error ? '—' : activities.length}</strong></div>
            </article>
            <article className="summary-card">
              <span className="summary-symbol summary-symbol-blue">↗</span>
              <div><span className="summary-label">Ready to start</span><strong>{loading || error ? '—' : activities.length - completedCount}</strong></div>
            </article>
            <article className="summary-card">
              <span className="summary-symbol summary-symbol-purple">✓</span>
              <div><span className="summary-label">Completed</span><strong>{loading || error ? '—' : completedCount}</strong></div>
            </article>
          </section>

          <section id="activities" className="activities-section">
            <div className="section-heading">
              <div><p className="eyebrow">Your learning</p><h2>Instructor activities</h2></div>
              <span className="activity-count">{error ? '—' : `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}</span>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {loading ? (
              <div className="empty-panel" role="status">Loading your activities…</div>
            ) : error ? null : activities.length ? (
              <div className="activity-grid">
                {activities.map((activity) => <ActivityCard key={activity.id} activity={activity} />)}
              </div>
            ) : (
              <div className="empty-panel">
                <span className="empty-illustration" aria-hidden="true">PC</span>
                <h3>No activities yet</h3>
                <p>When your instructor publishes an activity, it will appear here.</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/auth/me')
      .then((data) => {
        if (!active) return;
        if (!data.user) {
          window.location.replace('/?login_required=student-dashboard');
          return;
        }
        if (data.user.role === 'student') setUser(data.user);
        else setSessionError('This dashboard is available to student accounts.');
      })
      .catch((err) => {
        if (active) setSessionError(err.message);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  async function signOut() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      window.location.replace('/?login_required=student-dashboard');
    } catch (err) {
      setSessionError(err.message);
    }
  }

  if (checkingSession) return <main className="loading-screen" role="status">Loading your student workspace…</main>;
  if (user) return <Dashboard user={user} onSignOut={signOut} />;
  return (
    <main className="loading-screen">
      <p role="alert">{sessionError || 'Redirecting to sign in…'}</p>
      {sessionError && <a href="/">Return to Assembly PC</a>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
