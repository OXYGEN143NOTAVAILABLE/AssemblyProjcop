import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apiRequest, clearStoredSession, getInitials } from './api.js';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { OverviewView } from './components/OverviewView.jsx';
import { ActivitiesView } from './components/ActivitiesView.jsx';
import { ClassesView } from './components/ClassesView.jsx';
import { ResultsView } from './components/ResultsView.jsx';
import { AccountView } from './components/AccountView.jsx';
import './student.css';

const EMPTY_STATS = {
  assigned: 0,
  notStarted: 0,
  inProgress: 0,
  awaitingReview: 0,
  released: 0,
  nextUpId: null,
};

function NavIcon({ name }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  switch (name) {
    case 'overview':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="11" width="7" height="10" rx="1.5" />
          <rect x="3" y="14" width="8" height="7" rx="1.5" />
        </svg>
      );
    case 'activities':
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'classes':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'results':
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case 'account':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
        </svg>
      );
    default:
      return null;
  }
}

function StudentDashboardApp() {
  const [authState, setAuthState] = useState({
    checking: true,
    user: null,
    unauthorizedRole: null,
  });

  const [workspace, setWorkspace] = useState({
    loading: true,
    error: '',
    activities: [],
    stats: EMPTY_STATS,
    classes: [],
    privacyRequests: [],
    sessionTimeoutMinutes: 30,
  });

  const [activeView, setActiveView] = useState('overview');
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  const [sidebarHidden, setSidebarHidden] = useState(() => {
    try {
      return localStorage.getItem('student_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const accountRef = useRef(null);
  const mobileAccountRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState(30);

  const performSignOut = useCallback(async (reasonQuery = '') => {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Ignore network failure during logout cleanup
    } finally {
      clearStoredSession();
      window.location.replace(`/${reasonQuery}`);
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    setWorkspace((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await apiRequest('/api/student/activities');
      const activities = Array.isArray(data?.activities) ? data.activities : [];
      const classes = Array.isArray(data?.classes) ? data.classes : [];
      const privacyRequests = Array.isArray(data?.privacyRequests) ? data.privacyRequests : [];
      const timeoutMin = Number(data?.sessionTimeoutMinutes) || 30;

      setWorkspace({
        loading: false,
        error: '',
        activities,
        stats: data?.stats || EMPTY_STATS,
        classes,
        privacyRequests,
        sessionTimeoutMinutes: timeoutMin,
      });

      setSelectedActivityId((prev) => {
        if (prev && activities.some((a) => String(a.id) === String(prev))) return prev;
        return data?.stats?.nextUpId || activities[0]?.id || null;
      });
    } catch (err) {
      setWorkspace((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Unable to load your student workspace right now.',
      }));
    }
  }, []);

  // Authenticate student session on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await apiRequest('/api/auth/me');
        if (!active) return;
        const user = me?.user || null;
        if (!user) {
          window.location.replace('/?login_required=student-dashboard');
          return;
        }
        if (user.role !== 'student') {
          setAuthState({ checking: false, user, unauthorizedRole: user.role });
          return;
        }
        setAuthState({ checking: false, user, unauthorizedRole: null });
        loadWorkspace();
      } catch {
        if (active) {
          window.location.replace('/?login_required=student-dashboard');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadWorkspace]);

  // Close profile menus on outside click
  useEffect(() => {
    const onDocClick = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
      if (mobileAccountRef.current && !mobileAccountRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // SEC-07: 30-minute inactivity timeout tracker
  useEffect(() => {
    if (authState.checking || !authState.user || authState.unauthorizedRole) return undefined;

    const timeoutMs = (workspace.sessionTimeoutMinutes || 30) * 60 * 1000;
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - elapsed;
      if (remaining <= 0) {
        window.clearInterval(timer);
        performSignOut('?login_required=student-dashboard&timeout=1');
        return;
      }
      setSessionMinutesLeft(Math.max(1, Math.ceil(remaining / 60000)));
    }, 30000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      window.clearInterval(timer);
    };
  }, [authState.checking, authState.user, authState.unauthorizedRole, workspace.sessionTimeoutMinutes, performSignOut]);

  function toggleSidebar(nextHidden) {
    setSidebarHidden(nextHidden);
    try {
      localStorage.setItem('student_sidebar_collapsed', nextHidden ? '1' : '0');
    } catch {}
  }

  function handleOpenActivity(activityId) {
    setSelectedActivityId(activityId);
    setStatusFilter('all');
    setClassFilter('all');
    setActiveView('activities');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenClassActivities(classId) {
    setClassFilter(String(classId));
    setStatusFilter('all');
    setActiveView('activities');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleClassesUpdated(updatedClasses) {
    setWorkspace((prev) => ({ ...prev, classes: updatedClasses }));
    loadWorkspace();
  }

  function handlePrivacyRequestAdded(request) {
    setWorkspace((prev) => ({
      ...prev,
      privacyRequests: [request, ...prev.privacyRequests],
    }));
  }

  if (authState.checking) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <img src="/static/assembly-pc-logo.svg" alt="Assembly PC" className="brand-logo" />
        <p className="muted-copy">Loading student dashboard…</p>
      </div>
    );
  }

  if (authState.unauthorizedRole) {
    return (
      <div className="loading-screen">
        <div className="panel access-card">
          <div className="panel-body">
            <p className="section-kicker">Access notice</p>
            <h1 className="access-title">Student account required</h1>
            <p className="muted-copy">
              You are signed in as <strong>{authState.user?.displayName || authState.unauthorizedRole}</strong> ({authState.unauthorizedRole}). Sign in with a student account to view the Student Dashboard.
            </p>
            <div className="detail-actions">
              <a className="btn-primary" href="/">Return to home</a>
              {authState.unauthorizedRole === 'admin' && (
                <a className="btn-secondary" href="/admin">Open admin dashboard</a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const user = authState.user;
  const navItems = [
    { key: 'overview', label: 'Overview', count: null },
    { key: 'activities', label: 'My activities', count: workspace.stats.assigned || null },
    { key: 'classes', label: 'Classes', count: workspace.classes.length || null },
    { key: 'results', label: 'Results & feedback', count: workspace.stats.released || null },
  ];

  return (
    <div className={`app-shell ${sidebarHidden ? 'sidebar-collapsed' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <a href="/student/dashboard" className="topbar-brand" aria-label="Assembly PC Student Dashboard">
            <img src="/static/assembly-pc-logo.svg" alt="Assembly PC" className="brand-logo" />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-section">Student Dashboard</span>
          </a>
        </div>

        <div className="topbar-actions">
          <a className="topbar-link" href="/simulator">
            <span className="desktop-only-text">Open simulator</span>
            <span className="mobile-only-text">Simulator</span>
          </a>
          {activeView !== 'classes' && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setActiveView('classes')}
            >
              Join class
            </button>
          )}
          <div className="mobile-account-wrap" ref={mobileAccountRef}>
            <button
              type="button"
              className={`mobile-avatar-btn ${activeView === 'account' ? 'active' : ''}`}
              aria-label="Account options"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobileProfileMenu"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {getInitials(user?.displayName)}
            </button>
            {mobileMenuOpen && (
              <div className="profile-menu mobile-profile-menu" id="mobileProfileMenu" role="menu">
                <div className="mobile-menu-header">
                  <strong>{user?.displayName || 'Student'}</strong>
                  <span className="mono-num">{user?.studentId || 'Student account'}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActiveView('account');
                    setMobileMenuOpen(false);
                  }}
                >
                  Profile &amp; privacy
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSignOutOpen(true);
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className="sidebar" id="studentSidebar" aria-label="Student dashboard">
        <div className="sidebar-head">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => toggleSidebar(true)}
            aria-label="Hide sidebar"
            aria-expanded={!sidebarHidden}
            aria-controls="studentSidebar"
            title="Hide sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="nav-caption">Student space</div>

        <nav className="side-nav" aria-label="Student sections">
          {navItems.map((item) => {
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`side-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveView(item.key)}
              >
                <span className="side-link-main">
                  <NavIcon name={item.key} />
                  <span>{item.label}</span>
                </span>
                {item.count !== null && (
                  <span className="side-badge mono-num">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-account" ref={accountRef}>
          <div className="sidebar-account-row">
            <button
              type="button"
              className={`profile-chip ${activeView === 'account' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('account');
                setProfileMenuOpen(false);
              }}
              aria-label="Open student account"
            >
              <span className="avatar" aria-hidden="true">
                {getInitials(user?.displayName)}
              </span>
              <span className="account-meta">
                <strong>{user?.displayName || 'Student'}</strong>
                <span className="mono-num">{user?.studentId || 'Student account'}</span>
              </span>
            </button>

            <button
              type="button"
              className="profile-menu-toggle"
              aria-label="More account options"
              aria-expanded={profileMenuOpen}
              aria-controls="profileMenu"
              title="More options"
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
          </div>

          {profileMenuOpen && (
            <div className="profile-menu" id="profileMenu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActiveView('account');
                  setProfileMenuOpen(false);
                }}
              >
                Profile &amp; privacy
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setSignOutOpen(true);
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main-area">
        <button
          type="button"
          className="sidebar-toggle sidebar-show-toggle"
          onClick={() => toggleSidebar(false)}
          aria-label="Show sidebar"
          aria-expanded={!sidebarHidden}
          aria-controls="studentSidebar"
          title="Show sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="content-wrap">
          {activeView === 'overview' && (
            <OverviewView
              user={user}
              activities={workspace.activities}
              stats={workspace.stats}
              classes={workspace.classes}
              loading={workspace.loading}
              error={workspace.error}
              onOpenActivity={handleOpenActivity}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'activities' && (
            <ActivitiesView
              activities={workspace.activities}
              classes={workspace.classes}
              selectedId={selectedActivityId}
              statusFilter={statusFilter}
              classFilter={classFilter}
              onSelectActivity={setSelectedActivityId}
              onStatusFilterChange={setStatusFilter}
              onClassFilterChange={setClassFilter}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'classes' && (
            <ClassesView
              classes={workspace.classes}
              onClassesUpdated={handleClassesUpdated}
              onOpenClassActivities={handleOpenClassActivities}
            />
          )}

          {activeView === 'results' && (
            <ResultsView
              activities={workspace.activities}
              onOpenActivity={handleOpenActivity}
            />
          )}

          {activeView === 'account' && (
            <AccountView
              user={user}
              classes={workspace.classes}
              privacyRequests={workspace.privacyRequests}
              sessionMinutesLeft={sessionMinutesLeft}
              onPrivacyRequestAdded={handlePrivacyRequestAdded}
              onRequestSignOut={() => setSignOutOpen(true)}
            />
          )}
        </div>
      </main>

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out of Assembly PC?"
        description="Your autosaved activity drafts remain stored securely on the server. You will return to the Assembly PC home page."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="primary"
        busy={signingOut}
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => performSignOut('')}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StudentDashboardApp />
  </React.StrictMode>
);
