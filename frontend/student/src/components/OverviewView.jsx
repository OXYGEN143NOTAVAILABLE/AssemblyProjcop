import React from 'react';
import { formatDate, getFirstName, statusInfo } from '../api.js';

export function OverviewView({
  user,
  activities,
  stats,
  classes,
  loading,
  error,
  onOpenActivity,
  onNavigate,
}) {
  const firstName = getFirstName(user?.displayName);
  const nextUp = activities.find((a) => String(a.id) === String(stats?.nextUpId)) || null;

  const lanes = [
    {
      key: 'notStarted',
      title: 'Not started',
      items: activities.filter((a) => a.status === 'notStarted'),
    },
    {
      key: 'inProgress',
      title: 'In progress',
      items: activities.filter((a) => a.status === 'inProgress'),
    },
    {
      key: 'submitted',
      title: 'Submitted',
      items: activities.filter((a) => a.status === 'submitted' || a.status === 'released'),
    },
  ];

  const recentSubmissions = activities
    .filter((a) => a.status === 'submitted' || a.status === 'released')
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
    .slice(0, 5);

  const approvedClasses = classes.filter((c) => c.enrollmentStatus === 'approved').length;
  const pendingClasses = classes.filter((c) => c.enrollmentStatus === 'pending').length;

  return (
    <section className="view-section" aria-labelledby="overviewHeading">
      <header className="page-intro">
        <p className="section-kicker">Student dashboard</p>
        <h1 id="overviewHeading">Good day, {firstName}!</h1>
        <p className="intro-copy">
          Pick up where you left off and keep building your PC knowledge.
        </p>
      </header>

      {error && (
        <div className="inline-alert inline-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="summary-grid" aria-label="Your assignment summary">
        <article className="panel summary-card">
          <span className="summary-icon blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 6h13M8 12h13M8 18h13" />
              <path d="M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </span>
          <div>
            <div className="summary-label">Assigned activities</div>
            <div className="summary-value mono-num">{loading ? '—' : stats.assigned}</div>
          </div>
        </article>

        <article className="panel summary-card">
          <span className="summary-icon amber" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div>
            <div className="summary-label">In progress</div>
            <div className="summary-value mono-num">{loading ? '—' : stats.inProgress}</div>
          </div>
        </article>

        <article className="panel summary-card">
          <span className="summary-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <div>
            <div className="summary-label">Awaiting review</div>
            <div className="summary-value mono-num">{loading ? '—' : stats.awaitingReview}</div>
          </div>
        </article>
      </div>

      <div className="overview-grid">
        <div className="overview-main">
          <section className="panel" aria-labelledby="activityBoardTitle">
            <div className="panel-head">
              <h2 id="activityBoardTitle">My activities</h2>
              <button
                type="button"
                className="link-action"
                onClick={() => onNavigate('activities')}
              >
                View all
              </button>
            </div>

            {loading ? (
              <div className="empty-state" role="status">Loading assigned activities…</div>
            ) : (
              <div className="board-columns">
                {lanes.map((lane) => (
                  <div className="board-column" key={lane.key}>
                    <div className="board-col-head">
                      <span className="board-col-title">{lane.title}</span>
                      <span className="board-col-count mono-num">{lane.items.length}</span>
                    </div>
                    <div className="board-col-list">
                      {lane.items.length ? (
                        lane.items.map((activity) => {
                          const meta = statusInfo(activity.status);
                          return (
                            <button
                              key={activity.id}
                              type="button"
                              className="board-item"
                              onClick={() => onOpenActivity(activity.id)}
                            >
                              <strong className="board-item-title">{activity.title}</strong>
                              <span className="board-item-meta">
                                <span>{activity.className}</span>
                                {activity.dueDate && (
                                  <span className="nowrap-token">Due {formatDate(activity.dueDate)}</span>
                                )}
                              </span>
                              <span className={`state-text state-${meta.tone}`}>
                                {meta.label}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="board-empty">Nothing here yet</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="submissionsTitle">
            <div className="panel-head">
              <h2 id="submissionsTitle">Submission updates</h2>
              <button
                type="button"
                className="link-action"
                onClick={() => onNavigate('results')}
              >
                Open results
              </button>
            </div>

            <div className="panel-body-flush">
              {recentSubmissions.length ? (
                <ul className="submission-list">
                  {recentSubmissions.map((activity) => {
                    const isReleased = activity.status === 'released' && activity.releasedResult;
                    return (
                      <li key={activity.id} className="submission-row">
                        <div className="submission-copy">
                          <button
                            type="button"
                            className="submission-title-btn"
                            onClick={() => onOpenActivity(activity.id)}
                          >
                            {activity.title}
                          </button>
                          <div className="meta-line">
                            <span>{statusInfo(activity.status).label}</span>
                            {activity.submittedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Submitted {formatDate(activity.submittedAt)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="submission-right">
                          {isReleased ? (
                            <span className="score-readout mono-num">
                              {activity.releasedResult.activityScore}%
                            </span>
                          ) : (
                            <span className="withheld-note">Pending release</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="empty-state">
                  <strong>No submissions yet</strong>
                  <p>Submitted activities and review updates will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="overview-aside">
          <section className="panel progress-card" aria-labelledby="statusBreakdownTitle">
            <div className="progress-top">
              <h2 id="statusBreakdownTitle">Assignment status</h2>
            </div>
            <p className="muted-copy mt-sm">
              {loading
                ? 'Loading status…'
                : `${stats.assigned} instructor-assigned ${stats.assigned === 1 ? 'activity' : 'activities'} across ${approvedClasses} enrolled ${approvedClasses === 1 ? 'class' : 'classes'}${pendingClasses > 0 ? ` (${pendingClasses} pending approval)` : ''}.`}
            </p>

            <dl className="breakdown-list mt-md">
              <div className="breakdown-row">
                <dt>Not started</dt>
                <dd className="mono-num">{loading ? '—' : stats.notStarted}</dd>
              </div>
              <div className="breakdown-row">
                <dt>In progress</dt>
                <dd className="mono-num">{loading ? '—' : stats.inProgress}</dd>
              </div>
              <div className="breakdown-row">
                <dt>Awaiting review</dt>
                <dd className="mono-num">{loading ? '—' : stats.awaitingReview}</dd>
              </div>
              <div className="breakdown-row">
                <dt>Results released</dt>
                <dd className="mono-num">{loading ? '—' : stats.released}</dd>
              </div>
            </dl>

            <div className="divider-line" />

            <div className="next-up-block">
              <h3>Next up</h3>
              {nextUp ? (
                <>
                  <button
                    type="button"
                    className="board-item"
                    onClick={() => onOpenActivity(nextUp.id)}
                  >
                    <strong className="board-item-title">{nextUp.title}</strong>
                    <span className="board-item-meta">
                      {nextUp.status === 'inProgress' ? 'Continue your saved work' : 'Start assigned activity'}
                    </span>
                  </button>
                  <a
                    className="btn-primary btn-full mt-sm"
                    href={`/simulator?scenario=${encodeURIComponent(nextUp.id)}`}
                  >
                    {nextUp.status === 'inProgress' ? 'Continue in simulator' : 'Start in simulator'}
                  </a>
                </>
              ) : (
                <p className="muted-copy">
                  All assigned activities have been submitted. Check Results &amp; feedback for updates.
                </p>
              )}
            </div>

            <div className="divider-line" />

            <div className="aside-cta-row">
              <p className="aside-hint">Need to join another BSIT section?</p>
              <button
                type="button"
                className="link-action"
                onClick={() => onNavigate('classes')}
              >
                Enter class join code
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
