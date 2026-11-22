import React, { useMemo } from 'react';
import { extractObjectives, formatDate, formatDateTime, statusInfo } from '../api.js';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'notStarted', label: 'Not started' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'submitted', label: 'Awaiting review' },
  { key: 'released', label: 'Released' },
];

export function ActivitiesView({
  activities,
  classes,
  selectedId,
  statusFilter,
  classFilter,
  onSelectActivity,
  onStatusFilterChange,
  onClassFilterChange,
  onNavigate,
}) {
  const filtered = useMemo(() => {
    return activities.filter((act) => {
      if (statusFilter !== 'all' && act.status !== statusFilter) return false;
      if (classFilter !== 'all' && String(act.classId) !== String(classFilter)) return false;
      return true;
    });
  }, [activities, statusFilter, classFilter]);

  const activeActivity =
    filtered.find((item) => String(item.id) === String(selectedId)) ||
    filtered[0] ||
    null;

  const objectives = activeActivity ? extractObjectives(activeActivity) : [];
  const meta = activeActivity ? statusInfo(activeActivity.status) : null;

  return (
    <section className="view-section" aria-labelledby="activitiesHeading">
      <header className="page-intro">
        <p className="section-kicker">Instructor assignments</p>
        <h1 id="activitiesHeading">My activities</h1>
        <p className="intro-copy">
          Select an activity to review objectives, single-attempt submission rules, autosave recovery, or official results.
        </p>
      </header>

      <div className="toolbar-row">
        <div className="segmented-tabs" role="tablist" aria-label="Filter activities by status">
          {STATUS_FILTERS.map((tab) => {
            const count = tab.key === 'all'
              ? activities.length
              : activities.filter((a) => a.status === tab.key).length;
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`seg-btn ${active ? 'active' : ''}`}
                onClick={() => onStatusFilterChange(tab.key)}
              >
                {tab.label}
                <span className="seg-count mono-num">{count}</span>
              </button>
            );
          })}
        </div>

        <label className="select-filter">
          <span className="select-filter-label">Class</span>
          <select
            value={classFilter}
            onChange={(e) => onClassFilterChange(e.target.value)}
            aria-label="Filter by enrolled class"
          >
            <option value="all">All classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={String(cls.id)}>
                {cls.courseCode} · {cls.section}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="master-detail">
        <section className="panel list-panel" aria-label="Assigned activities list">
          {filtered.length ? (
            <div className="activity-options">
              {filtered.map((activity) => {
                const isSelected = activeActivity && String(activity.id) === String(activeActivity.id);
                const st = statusInfo(activity.status);
                return (
                  <button
                    key={activity.id}
                    type="button"
                    className={`activity-row-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectActivity(activity.id)}
                  >
                    <div className="activity-row-top">
                      <strong className="activity-row-title">{activity.title}</strong>
                      <span className={`state-text state-${st.tone}`}>{st.shortLabel}</span>
                    </div>
                    <div className="meta-line">
                      <span>{activity.className}</span>
                      {activity.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Due {formatDate(activity.dueDate)}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No matching activities</strong>
              <p>Try switching the status filter or class filter above.</p>
            </div>
          )}
        </section>

        <section className="panel detail-panel" aria-live="polite">
          {!activeActivity ? (
            <div className="empty-state">
              <strong>Select an activity</strong>
              <p>Choose an assigned activity from the list to review its requirements and launch the simulator.</p>
            </div>
          ) : (
            <>
              <div className="panel-head">
                <span className={`state-text state-${meta.tone}`}>{meta.label}</span>
                <span className="head-attribution">
                  Assigned by {activeActivity.instructor?.displayName || 'Instructor'}
                </span>
              </div>

              <div className="detail-body">
                <h2 className="detail-title">{activeActivity.title}</h2>
                <p className="detail-desc">
                  {activeActivity.description || 'Complete the PC assembly activity configured by your instructor.'}
                </p>

                <div className="meta-line detail-meta-line">
                  <span className="nowrap-token">{activeActivity.activityType || 'PC build'}</span>
                  <span className="nowrap-token">{activeActivity.className}</span>
                  {activeActivity.tier && (
                    <span className="nowrap-token">{activeActivity.tier}</span>
                  )}
                  {activeActivity.timeLimitMinutes && (
                    <span className="mono-num nowrap-token">{activeActivity.timeLimitMinutes} min</span>
                  )}
                  {activeActivity.budget && (
                    <span className="mono-num nowrap-token">Budget ${Number(activeActivity.budget).toLocaleString()}</span>
                  )}
                  {activeActivity.dueDate && (
                    <span className="nowrap-token">Due {formatDate(activeActivity.dueDate)}</span>
                  )}
                </div>

                {activeActivity.canStart && (
                  <div className="detail-actions detail-actions-top">
                    <a
                      className="btn-primary"
                      href={`/simulator?scenario=${encodeURIComponent(activeActivity.id)}`}
                    >
                      {activeActivity.status === 'inProgress' ? 'Continue activity in 3D simulator' : 'Start activity in 3D simulator'}
                    </a>
                  </div>
                )}

                <div className="divider-line" />

                <div className="detail-section">
                  <h3>Activity requirements</h3>
                  {objectives.length ? (
                    <ul className="req-list">
                      {objectives.map((obj, idx) => (
                        <li key={idx}>{obj}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-copy">Follow standard compatibility and installation guidelines in the 3D simulator.</p>
                  )}
                </div>

                <div className="divider-line" />

                <div className="detail-rules">
                  <div className="rule-block">
                    <h3>Submission rule</h3>
                    <p className="muted-copy">
                      {activeActivity.status === 'submitted' || activeActivity.status === 'released'
                        ? `${activeActivity.attemptsUsed} of ${activeActivity.attemptsAllowed} submission used. Ask your instructor to reopen this activity if another attempt is required.`
                        : `${activeActivity.attemptsAllowed} submission permitted per activity (${activeActivity.attemptsUsed} used). Compatibility evaluation runs after submission, and you will be asked to confirm before finalizing.`}
                    </p>
                  </div>

                  {activeActivity.status === 'inProgress' && (
                    <div className="rule-block rule-callout-green">
                      <h3>Autosave and recovery active</h3>
                      <p className="muted-copy">
                        Your build state persists automatically every 30 seconds and on every component change so work is restored if your session is interrupted.
                        {activeActivity.lastSavedAt ? ` Last saved ${formatDateTime(activeActivity.lastSavedAt)}.` : ''}
                      </p>
                    </div>
                  )}

                  {activeActivity.status === 'submitted' && (
                    <div className="rule-block rule-callout-amber">
                      <h3>Awaiting instructor review</h3>
                      <p className="muted-copy">
                        Submitted {activeActivity.submittedAt ? formatDateTime(activeActivity.submittedAt) : 'recently'}. Per classroom policy, proposed compatibility findings and scores remain withheld until your instructor confirms and releases the official result.
                      </p>
                    </div>
                  )}

                  {activeActivity.status === 'released' && activeActivity.releasedResult && (
                    <div className="rule-block rule-callout-released">
                      <div className="released-head">
                        <div>
                          <h3>Official released evaluation</h3>
                          <p className="meta-line">
                            <span>Verdict: <strong>{activeActivity.releasedResult.compatibilityVerdict}</strong></span>
                            <span aria-hidden="true">·</span>
                            <span>Released by {activeActivity.releasedResult.instructorName}</span>
                            {activeActivity.releasedResult.releasedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{formatDateTime(activeActivity.releasedResult.releasedAt)}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="released-score mono-num">
                          {activeActivity.releasedResult.activityScore}%
                        </div>
                      </div>

                      {activeActivity.releasedResult.issues?.length > 0 && (
                        <div className="released-subblock">
                          <h4>Compatibility findings</h4>
                          <ul className="req-list">
                            {activeActivity.releasedResult.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="released-subblock">
                        <h4>Instructor feedback</h4>
                        <p className="muted-copy">
                          {activeActivity.releasedResult.feedback || 'No additional written feedback provided.'}
                        </p>
                      </div>

                      <p className="integrity-note">
                        Official record — read-only. Stored evaluations cannot be modified by student accounts.
                      </p>
                    </div>
                  )}
                </div>

                {activeActivity.status === 'released' && (
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onNavigate('results')}
                    >
                      View in Results &amp; feedback
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
