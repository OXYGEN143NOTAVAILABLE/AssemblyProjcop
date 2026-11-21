import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './student.css';

const FALLBACK_ACTIVITY_INFO = {
  'fault lab 1: no-post & inverted airflow rig': {
    description:
      'Diagnose why this workstation fails POST & thermal checks: inspect CPU orientation, thermal paste, PSU/case fan orientation, and GPU power cabling.',
    tier: 'Intermediate',
    activityType: 'troubleshoot',
  },
  'fault lab 2: memory conflict & unplugged rails': {
    description:
      'This workstation halts at boot with memory and power faults. Swap out incompatible RAM, re-fasten unlatched components, and connect missing motherboard cables.',
    tier: 'Intermediate',
    activityType: 'troubleshoot',
  },
  'am5 ddr5 workstation build': {
    description: 'Assemble a compatible AM5 DDR5 PC with NVMe storage and an RTX 4070.',
    tier: 'High End',
    activityType: 'build',
  },
  'entry lga1700 lab pc': {
    description: 'Configure an entry-level LGA1700 DDR4 system suitable for classroom workstations.',
    tier: 'Entry',
    activityType: 'build',
  },
};

function getFallbackActivityInfo(title) {
  const key = String(title || '').trim().toLowerCase();
  if (!key) return null;
  if (FALLBACK_ACTIVITY_INFO[key]) return FALLBACK_ACTIVITY_INFO[key];
  if (key.includes('fault lab 1') || key.includes('no-post')) {
    return FALLBACK_ACTIVITY_INFO['fault lab 1: no-post & inverted airflow rig'];
  }
  if (key.includes('fault lab 2') || key.includes('memory conflict')) {
    return FALLBACK_ACTIVITY_INFO['fault lab 2: memory conflict & unplugged rails'];
  }
  if (key.includes('am5 ddr5')) {
    return FALLBACK_ACTIVITY_INFO['am5 ddr5 workstation build'];
  }
  if (key.includes('lga1700')) {
    return FALLBACK_ACTIVITY_INFO['entry lga1700 lab pc'];
  }
  return null;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.detail?.error ||
      (typeof data?.detail === 'string' ? data.detail : '') ||
      data?.error ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data || {};
}

function redirectByRole(user) {
  if (!user) {
    window.location.replace('/?login_required=student');
    return false;
  }
  if (user.role === 'instructor') {
    window.location.replace('/instructor');
    return false;
  }
  if (user.role === 'admin') {
    window.location.replace('/admin');
    return false;
  }
  return user.role === 'student';
}

function formatDueDateLabel(activity) {
  if (activity.dueAt) {
    const dt = new Date(activity.dueAt);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  if (activity.dueDateValue) {
    return activity.dueTimeValue
      ? `${activity.dueDateValue} ${activity.dueTimeValue}`
      : activity.dueDateValue;
  }
  return '';
}

function formatShortDate(isoValue) {
  if (!isoValue) return '';
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatActivityType(rawType) {
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'troubleshoot') return 'Troubleshooting';
  if (normalized === 'build') return 'PC Build';
  return rawType || 'PC Build';
}

function resolveActivityStatus(activity) {
  if (activity.status === 'completed' || activity.status === 'locked' || activity.status === 'notStarted') {
    return activity.status;
  }
  if (activity.isSubmitted) return 'completed';
  if (activity.isLocked) return 'locked';
  return 'notStarted';
}

function ActivityCard({ activity }) {
  const title = activity.title || activity.activityName || 'Untitled Activity';
  const fallback = getFallbackActivityInfo(title);
  const description =
    (activity.description && String(activity.description).trim()) ||
    fallback?.description ||
    'An interactive 3D PC assembly activity assigned by your instructor.';
  const tier = activity.tier || fallback?.tier || '';
  const activityType = activity.activityType || fallback?.activityType || 'build';
  const isLocked = Boolean(activity.isLocked);
  const isSubmitted = Boolean(activity.isSubmitted);
  const status = resolveActivityStatus(activity);
  const score = activity.score ?? activity.completion?.score ?? null;
  const dueLabel = formatDueDateLabel(activity);
  const isTroubleshoot = String(activityType).toLowerCase() === 'troubleshoot';

  let statusLabel = 'Ready to start';
  let statusClass = '';
  if (isLocked) {
    statusLabel = 'Locked';
    statusClass = 'locked';
  } else if (isSubmitted || status === 'completed') {
    statusLabel = 'Completed';
    statusClass = 'complete';
  }

  const cardBody = (
    <>
      <div className="activity-card-top">
        <span
          className={`activity-icon ${isTroubleshoot ? 'is-troubleshoot' : ''}`}
          aria-hidden="true"
        >
          {isTroubleshoot ? 'LAB' : 'PC'}
        </span>
        <div className="activity-badges-right">
          {activity.className && (
            <span className="classroom-chip" title={activity.className}>
              {activity.className}
            </span>
          )}
          <span className={`activity-status ${statusClass}`}>{statusLabel}</span>
        </div>
      </div>

      <h3>{title}</h3>
      <p className="activity-description">{description}</p>

      <div className="activity-meta">
        <span>{formatActivityType(activityType)}</span>
        {tier && <span>{tier}</span>}
        {activity.timeLimitMinutes ? <span>{activity.timeLimitMinutes} min</span> : null}
        {dueLabel && <span className="due-badge">Due {dueLabel}</span>}
        {score !== null && score !== undefined && (
          <span className="score-pill">Score: {score}/100</span>
        )}
      </div>

      <div className="activity-card-footer">
        <span className="instructor-name">By {activity.instructorName || 'Instructor'}</span>
        {isLocked ? (
          <span className="locked-label">Locked by instructor</span>
        ) : (
          <span className="launch-label">
            {isSubmitted ? 'Re-open lab' : 'Open simulation'} <span aria-hidden="true">→</span>
          </span>
        )}
      </div>
    </>
  );

  if (isLocked) {
    return (
      <article className="activity-card is-locked" aria-disabled="true">
        {cardBody}
      </article>
    );
  }

  return (
    <a className="activity-card" href={`/simulator?activity=${encodeURIComponent(activity.id)}`}>
      {cardBody}
    </a>
  );
}

function getInitialTab() {
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  if (tabParam === 'classrooms' || tabParam === 'activities' || tabParam === 'dashboard') {
    return tabParam;
  }
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'classrooms' || hash === 'activities' || hash === 'dashboard') {
    return hash;
  }
  return 'dashboard';
}

function Dashboard({ user, onSignOut }) {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [activities, setActivities] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedClassroomId, setSelectedClassroomId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [joinCode, setJoinCode] = useState('');
  const [joiningClassroom, setJoiningClassroom] = useState(false);
  const [respondingInviteIds, setRespondingInviteIds] = useState({});
  const [classroomFeedback, setClassroomFeedback] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const loadWorkspaceData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setLoadError('');
    try {
      const [activitiesData, classroomsData, invitationsData] = await Promise.all([
        request('/api/student/activities'),
        request('/api/student/classrooms'),
        request('/api/student/invitations'),
      ]);
      setActivities(Array.isArray(activitiesData.activities) ? activitiesData.activities : []);
      setClassrooms(Array.isArray(classroomsData.classrooms) ? classroomsData.classrooms : []);
      setInvitations(Array.isArray(invitationsData.invitations) ? invitationsData.invitations : []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace('/?login_required=student');
        return;
      }
      setLoadError(err.message || 'Could not load your student workspace.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const classroomFilterOptions = useMemo(() => {
    const map = new Map();
    for (const cls of classrooms) {
      map.set(String(cls.id), cls.displayName || cls.name || 'Classroom');
    }
    for (const act of activities) {
      if (act.classId && !map.has(String(act.classId))) {
        map.set(String(act.classId), act.className || 'Classroom');
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [classrooms, activities]);

  useEffect(() => {
    if (
      selectedClassroomId !== 'all' &&
      !classroomFilterOptions.some((opt) => opt.id === selectedClassroomId)
    ) {
      setSelectedClassroomId('all');
    }
  }, [classroomFilterOptions, selectedClassroomId]);

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (selectedClassroomId !== 'all' && String(act.classId) !== selectedClassroomId) {
        return false;
      }
      const status = resolveActivityStatus(act);
      if (selectedStatus === 'notStarted' && (act.isLocked || act.isSubmitted || status !== 'notStarted')) {
        return false;
      }
      if (selectedStatus === 'completed' && !act.isSubmitted && status !== 'completed') {
        return false;
      }
      if (selectedStatus === 'locked' && !act.isLocked && status !== 'locked') {
        return false;
      }
      return true;
    });
  }, [activities, selectedClassroomId, selectedStatus]);

  const completedCount = useMemo(
    () => activities.filter((act) => act.isSubmitted || resolveActivityStatus(act) === 'completed').length,
    [activities]
  );

  const readyCount = useMemo(
    () => activities.filter((act) => !act.isLocked && !act.isSubmitted).length,
    [activities]
  );

  const displayName = user.displayName || user.email || user.studentId || 'Student';
  const firstName = String(displayName).trim().split(/\s+/)[0] || 'Student';
  const initials =
    String(displayName)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'S';

  function openTab(tabName) {
    setActiveTab(tabName);
    window.scrollTo(0, 0);
  }

  function openClassroomActivities(classroomId) {
    setSelectedClassroomId(String(classroomId));
    setSelectedStatus('all');
    openTab('activities');
  }

  async function handleJoinClassroom(e) {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) {
      setClassroomFeedback({
        type: 'error',
        message: 'Enter a classroom join code from your instructor.',
      });
      return;
    }

    setJoiningClassroom(true);
    setClassroomFeedback(null);
    try {
      const data = await request('/api/student/classrooms/join', {
        method: 'POST',
        body: JSON.stringify({ joinCode: cleaned }),
      });
      const joinedName = data?.classroom?.displayName || data?.classroom?.name || 'classroom';
      setJoinCode('');
      setClassroomFeedback({
        type: 'success',
        message: `Joined "${joinedName}" successfully.`,
      });
      await loadWorkspaceData({ silent: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace('/?login_required=student');
        return;
      }
      setClassroomFeedback({
        type: 'error',
        message: err.message || 'Could not join classroom with that code.',
      });
    } finally {
      setJoiningClassroom(false);
    }
  }

  async function handleInvitationRespond(invitationId, action) {
    const key = String(invitationId);
    setRespondingInviteIds((prev) => ({ ...prev, [key]: true }));
    setClassroomFeedback(null);
    try {
      await request(`/api/student/invitations/${encodeURIComponent(key)}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setClassroomFeedback({
        type: 'success',
        message:
          action === 'accept'
            ? 'Invitation accepted! You are now enrolled in the classroom.'
            : 'Invitation declined.',
      });
      await loadWorkspaceData({ silent: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.replace('/?login_required=student');
        return;
      }
      setClassroomFeedback({
        type: 'error',
        message: err.message || 'Could not update invitation.',
      });
    } finally {
      setRespondingInviteIds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  const filterBar = (
    <div className="filters-stack">
      {classroomFilterOptions.length > 0 && (
        <div className="filter-row" role="group" aria-label="Filter by classroom">
          <span className="filter-label">Classroom:</span>
          <button
            type="button"
            className={`filter-pill ${selectedClassroomId === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedClassroomId('all')}
          >
            All Classrooms
          </button>
          {classroomFilterOptions.map((cls) => (
            <button
              key={cls.id}
              type="button"
              className={`filter-pill ${selectedClassroomId === cls.id ? 'active' : ''}`}
              onClick={() => setSelectedClassroomId(cls.id)}
            >
              {cls.label}
            </button>
          ))}
        </div>
      )}

      <div className="filter-row" role="group" aria-label="Filter by status">
        <span className="filter-label">Status:</span>
        {[
          { id: 'all', label: 'All' },
          { id: 'notStarted', label: 'Ready to Start' },
          { id: 'completed', label: 'Completed' },
          { id: 'locked', label: 'Locked' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter-pill ${selectedStatus === item.id ? 'active' : ''}`}
            onClick={() => setSelectedStatus(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  const activitiesGridSection = loading ? (
    <div className="empty-panel" role="status">
      Loading your classroom activities…
    </div>
  ) : loadError ? null : filteredActivities.length ? (
    <div className="activity-grid">
      {filteredActivities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  ) : activities.length ? (
    <div className="empty-panel">
      <span className="empty-illustration" aria-hidden="true">PC</span>
      <h3>No matching activities</h3>
      <p>Try clearing the classroom or status filters to see all assigned labs.</p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setSelectedClassroomId('all');
          setSelectedStatus('all');
        }}
      >
        Reset filters
      </button>
    </div>
  ) : (
    <div className="empty-panel">
      <span className="empty-illustration" aria-hidden="true">PC</span>
      <h3>No activities assigned yet</h3>
      <p>
        {classrooms.length
          ? 'Your instructors have not published activities in your enrolled classrooms yet.'
          : 'Join a classroom with a code or accept an invitation to see assigned 3D PC assembly labs.'}
      </p>
      {!classrooms.length && (
        <button type="button" className="primary-button" onClick={() => openTab('classrooms')}>
          Go to Classrooms <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Assembly PC home">
          {!logoFailed ? (
            <img
              className="brand-logo"
              src="/static/assembly-pc-logo.svg"
              alt="Assembly PC"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <>
              <span className="brand-mark" aria-hidden="true">PC</span>
              <span>
                Assembly <b>PC</b>
              </span>
            </>
          )}
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-section">Student Dashboard</span>
        </a>

        <div className="topbar-actions">
          <nav className="topbar-links" aria-label="Quick navigation">
            <a className="topbar-link simulator-link" href="/simulator">
              Open Simulator
            </a>
            <a className="topbar-link" href="/profile">
              Profile &amp; Builds
            </a>
            <a className="topbar-link" href="/gallery">
              Gallery
            </a>
          </nav>

          <button className="account-button" type="button" onClick={onSignOut}>
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="account-name">
              {displayName}
              <small>Student</small>
            </span>
            <span className="signout-label">Sign out</span>
          </button>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Mobile sections">
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => openTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => openTab('activities')}
        >
          My Activities ({activities.length})
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'classrooms' ? 'active' : ''}`}
          onClick={() => openTab('classrooms')}
        >
          Classrooms{invitations.length ? ` (${invitations.length} new)` : ''}
        </button>
        <a className="mobile-nav-link" href="/simulator">
          Simulator
        </a>
        <a className="mobile-nav-link" href="/profile">
          Profile
        </a>
        <a className="mobile-nav-link" href="/gallery">
          Gallery
        </a>
      </nav>

      <div className="dashboard-layout">
        <aside className="sidebar">
          <p className="nav-caption">Workspace</p>
          <button
            type="button"
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => openTab('dashboard')}
          >
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>
            <span>Dashboard</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'activities' ? 'active' : ''}`}
            onClick={() => openTab('activities')}
          >
            <span className="nav-icon" aria-hidden="true">
              ▣
            </span>
            <span>My Activities</span>
            {activities.length > 0 && <span className="nav-badge">{activities.length}</span>}
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'classrooms' ? 'active' : ''}`}
            onClick={() => openTab('classrooms')}
          >
            <span className="nav-icon" aria-hidden="true">
              ◈
            </span>
            <span>Classrooms</span>
            {invitations.length > 0 && (
              <span className="nav-badge nav-badge-alert" title="Pending invitations">
                {invitations.length}
              </span>
            )}
          </button>

          <p className="nav-caption nav-caption-spaced">Quick Links</p>
          <a className="nav-item" href="/simulator">
            <span className="nav-icon" aria-hidden="true">
              ▶
            </span>
            <span>Open Simulator</span>
          </a>
          <a className="nav-item" href="/profile">
            <span className="nav-icon" aria-hidden="true">
              ☺
            </span>
            <span>Profile &amp; Builds</span>
          </a>
          <a className="nav-item" href="/gallery">
            <span className="nav-icon" aria-hidden="true">
              ▤
            </span>
            <span>Gallery</span>
          </a>

          <div className="sidebar-bottom">
            <div className="help-card">
              <span className="help-mark" aria-hidden="true">
                ?
              </span>
              <strong>Need a hand?</strong>
              <p>
                Ask your instructor for a classroom join code or help troubleshooting a 3D build lab.
              </p>
            </div>
          </div>
        </aside>

        <main className="dashboard-content">
          {loadError && (
            <p className="error-message" role="alert">
              {loadError}
            </p>
          )}

          {activeTab === 'dashboard' && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">Student dashboard</p>
                  <h1>
                    Hi, {firstName} <span aria-hidden="true">👋</span>
                  </h1>
                  <p className="muted">
                    Pick up where you left off, launch an assigned lab, or manage your classrooms.
                  </p>
                </div>
                <div className="welcome-actions">
                  <a className="primary-button" href="/simulator">
                    Open simulator <span aria-hidden="true">→</span>
                  </a>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openTab('classrooms')}
                  >
                    Manage classrooms
                  </button>
                </div>
              </section>

              {invitations.length > 0 && (
                <section className="invite-banner" aria-label="Pending classroom invitations">
                  <div className="invite-banner-copy">
                    <span className="invite-banner-dot" aria-hidden="true">
                      {invitations.length}
                    </span>
                    <div>
                      <p className="invite-banner-title">
                        You have {invitations.length} pending classroom{' '}
                        {invitations.length === 1 ? 'invitation' : 'invitations'}
                      </p>
                      <p className="invite-banner-sub">
                        {invitations
                          .slice(0, 2)
                          .map((inv) => inv.classroomDisplayName || inv.classroomName)
                          .join(', ')}
                        {invitations.length > 2 ? ` +${invitations.length - 2} more` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openTab('classrooms')}
                  >
                    Review invitations <span aria-hidden="true">→</span>
                  </button>
                </section>
              )}

              <section className="summary-grid" aria-label="Activity summary">
                <article className="summary-card">
                  <span className="summary-symbol" aria-hidden="true">
                    ▣
                  </span>
                  <div>
                    <span className="summary-label">Assigned activities</span>
                    <strong>{loading || loadError ? '—' : activities.length}</strong>
                  </div>
                </article>
                <article className="summary-card">
                  <span className="summary-symbol summary-symbol-blue" aria-hidden="true">
                    ↗
                  </span>
                  <div>
                    <span className="summary-label">Ready to start</span>
                    <strong>{loading || loadError ? '—' : readyCount}</strong>
                  </div>
                </article>
                <article className="summary-card">
                  <span className="summary-symbol summary-symbol-purple" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <span className="summary-label">Completed</span>
                    <strong>{loading || loadError ? '—' : completedCount}</strong>
                  </div>
                </article>
              </section>

              <section id="activities" className="activities-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Your learning</p>
                    <h2>Instructor activities</h2>
                  </div>
                  <span className="activity-count">
                    {loadError
                      ? '—'
                      : `${filteredActivities.length} ${filteredActivities.length === 1 ? 'activity' : 'activities'}`}
                  </span>
                </div>
                {filterBar}
                {activitiesGridSection}
              </section>
            </>
          )}

          {activeTab === 'activities' && (
            <section className="activities-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Assignments</p>
                  <h2>My Activities</h2>
                </div>
                <span className="activity-count">
                  {loadError
                    ? '—'
                    : `${filteredActivities.length} of ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
                </span>
              </div>
              {filterBar}
              {activitiesGridSection}
            </section>
          )}

          {activeTab === 'classrooms' && (
            <section className="classrooms-layout">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Classroom hub</p>
                  <h2>Classrooms &amp; Invitations</h2>
                </div>
                <span className="activity-count">
                  {classrooms.length} enrolled · {invitations.length} pending
                </span>
              </div>

              {classroomFeedback && (
                <div
                  className={`feedback-banner ${
                    classroomFeedback.type === 'success' ? 'is-success' : 'is-error'
                  }`}
                  role={classroomFeedback.type === 'error' ? 'alert' : 'status'}
                >
                  <span>{classroomFeedback.message}</span>
                  <button
                    type="button"
                    className="feedback-dismiss"
                    aria-label="Dismiss message"
                    onClick={() => setClassroomFeedback(null)}
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="classroom-top-grid">
                <article className="panel-card">
                  <h3>Join Classroom by Code</h3>
                  <p className="panel-card-sub">
                    Enter the join code shared by your instructor to enroll and unlock activities.
                  </p>
                  <form className="join-form" onSubmit={handleJoinClassroom}>
                    <label htmlFor="student-join-code-input" className="sr-only">
                      Classroom join code
                    </label>
                    <input
                      id="student-join-code-input"
                      className="join-input"
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter join code (e.g. APC-7X9K)"
                      maxLength={32}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={joiningClassroom}
                    >
                      {joiningClassroom ? 'Joining…' : 'Join Classroom'}
                    </button>
                  </form>
                </article>

                <article className="panel-card">
                  <h3>Pending Invitations</h3>
                  <p className="panel-card-sub">
                    Accept an invitation to enroll right away, or decline if it was sent in error.
                  </p>
                  {loading ? (
                    <div className="empty-panel empty-panel-compact" role="status">
                      Checking invitations…
                    </div>
                  ) : invitations.length ? (
                    <div className="invitation-list">
                      {invitations.map((inv) => {
                        const isBusy = Boolean(respondingInviteIds[String(inv.id)]);
                        const invitedDate = formatShortDate(inv.createdAt);
                        return (
                          <div key={inv.id} className="invitation-row">
                            <div className="invitation-info">
                              <strong>
                                {inv.classroomDisplayName || inv.classroomName || 'Classroom'}
                              </strong>
                              <div className="invitation-meta">
                                <span>By {inv.instructorName || 'Instructor'}</span>
                                {inv.joinCode && (
                                  <span className="join-code-pill">{inv.joinCode}</span>
                                )}
                                {invitedDate && <span>Sent {invitedDate}</span>}
                              </div>
                            </div>
                            <div className="invitation-actions">
                              <button
                                type="button"
                                className="primary-button accept-btn"
                                disabled={isBusy}
                                onClick={() => handleInvitationRespond(inv.id, 'accept')}
                              >
                                {isBusy ? 'Saving…' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                className="danger-outline-button"
                                disabled={isBusy}
                                onClick={() => handleInvitationRespond(inv.id, 'decline')}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-panel empty-panel-compact">
                      <p>No pending classroom invitations right now.</p>
                    </div>
                  )}
                </article>
              </div>

              <div>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Active enrollment</p>
                    <h2>Enrolled Classrooms</h2>
                  </div>
                  <span className="activity-count">
                    {classrooms.length} {classrooms.length === 1 ? 'classroom' : 'classrooms'}
                  </span>
                </div>

                {loading ? (
                  <div className="empty-panel" role="status">
                    Loading enrolled classrooms…
                  </div>
                ) : classrooms.length ? (
                  <div className="classroom-grid">
                    {classrooms.map((cls) => {
                      const actCount = Number(
                        cls.activitiesCount ?? cls.activities?.length ?? 0
                      );
                      const enrolledDate = formatShortDate(cls.enrolledAt);
                      return (
                        <article key={cls.id} className="classroom-card">
                          <div className="classroom-card-head">
                            <h4>{cls.displayName || cls.name || 'Classroom'}</h4>
                            {cls.joinCode && (
                              <span className="join-code-pill">{cls.joinCode}</span>
                            )}
                          </div>
                          <p className="classroom-instructor">
                            Instructor: {cls.instructorName || 'Instructor'}
                          </p>
                          <div className="classroom-card-meta">
                            <span className="classroom-stat-chip">
                              {actCount} {actCount === 1 ? 'activity' : 'activities'}
                            </span>
                            {enrolledDate && (
                              <span className="classroom-stat-chip">Joined {enrolledDate}</span>
                            )}
                          </div>
                          <div className="classroom-card-footer">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => openClassroomActivities(cls.id)}
                            >
                              View Activities
                            </button>
                            <a className="launch-label" href="/simulator">
                              Simulator →
                            </a>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-panel">
                    <span className="empty-illustration" aria-hidden="true">
                      ◈
                    </span>
                    <h4>Not enrolled in any classroom yet</h4>
                    <p>
                      Use the join code form above or accept a pending invitation to start your
                      assigned PC assembly labs.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  const initialUser = typeof window !== 'undefined' ? window.AUTH_USER || null : null;
  const [user, setUser] = useState(initialUser && initialUser.role === 'student' ? initialUser : null);
  const [checkingSession, setCheckingSession] = useState(!initialUser);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    if (initialUser) {
      if (!redirectByRole(initialUser)) {
        setSessionError('This dashboard is available to student accounts.');
      }
      setCheckingSession(false);
      return;
    }

    let active = true;
    request('/api/auth/me')
      .then((data) => {
        if (!active) return;
        const authUser = data?.user || null;
        if (!redirectByRole(authUser)) {
          if (authUser) {
            setSessionError('This dashboard is available to student accounts.');
          }
          return;
        }
        try {
          sessionStorage.setItem('userRole', authUser.role);
          sessionStorage.setItem(
            'userName',
            authUser.displayName || authUser.email || authUser.studentId || 'User'
          );
        } catch (_) {}
        setUser(authUser);
      })
      .catch((err) => {
        if (active) {
          setSessionError(err.message || 'Unable to verify your session.');
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [initialUser]);

  async function signOut() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      window.location.replace('/?login_required=student');
    } catch (err) {
      setSessionError(err.message || 'Could not sign out.');
    }
  }

  if (checkingSession) {
    return (
      <main className="loading-screen" role="status">
        Loading your student workspace…
      </main>
    );
  }

  if (user) {
    return <Dashboard user={user} onSignOut={signOut} />;
  }

  return (
    <main className="loading-screen">
      <p role="alert">{sessionError || 'Redirecting to sign in…'}</p>
      {sessionError && <a href="/">Return to Assembly PC</a>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
