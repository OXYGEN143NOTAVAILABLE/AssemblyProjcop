import React, { useState } from 'react';
import { apiRequest, formatDate } from '../api.js';

export function ClassesView({ classes, onClassesUpdated, onOpenClassActivities }) {
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleJoinSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmed = joinCode.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter the class join code given by your instructor.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiRequest('/api/student/classes/join', {
        method: 'POST',
        body: JSON.stringify({ joinCode: trimmed }),
      });
      setJoinCode('');
      setSuccess(data.message || 'Class join request submitted.');
      if (Array.isArray(data.classes)) {
        onClassesUpdated(data.classes);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view-section" aria-labelledby="classesHeading">
      <header className="page-intro">
        <p className="section-kicker">Classroom enrollment</p>
        <h1 id="classesHeading">Classes</h1>
        <p className="intro-copy">
          Join an instructor-managed class using its join code. Activities assigned to your approved classes appear automatically in My activities.
        </p>
      </header>

      <div className="two-col-grid">
        <section className="panel" aria-labelledby="enrolledClassesTitle">
          <div className="panel-head">
            <div>
              <h2 id="enrolledClassesTitle">Your classes</h2>
              <p className="panel-sub">Approved enrollments grant access to assigned laboratory activities.</p>
            </div>
            <span className="head-attribution mono-num">
              {classes.length} {classes.length === 1 ? 'class' : 'classes'}
            </span>
          </div>

          <div className="panel-body-flush">
            {classes.length ? (
              <ul className="class-list">
                {classes.map((cls) => {
                  const approved = cls.enrollmentStatus === 'approved';
                  const pending = cls.enrollmentStatus === 'pending';
                  return (
                    <li key={cls.id} className="class-row">
                      <div className="class-row-main">
                        <div className="class-row-head">
                          <strong>{cls.courseCode} — {cls.className}</strong>
                          <span className={`state-text ${approved ? 'state-emerald' : pending ? 'state-amber' : 'state-slate'}`}>
                            {approved ? 'Enrolled' : pending ? 'Pending approval' : cls.enrollmentStatus}
                          </span>
                        </div>
                        <div className="meta-line meta-line-spaced">
                          <span className="nowrap-token">Section {cls.section}</span>
                          <span className="nowrap-token">{cls.instructorName}</span>
                          <span className="mono-num nowrap-token">Code {cls.joinCode}</span>
                          {cls.requestedAt && (
                            <span className="nowrap-token">Requested {formatDate(cls.requestedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="class-row-action">
                        {approved ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => onOpenClassActivities(cls.id)}
                          >
                            View activities
                          </button>
                        ) : (
                          <span className="withheld-note">Waiting for instructor</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty-state">
                <strong>Not enrolled in a class yet</strong>
                <p>Enter a join code on the right to request access to your instructor’s BSIT class.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="panel" aria-labelledby="joinClassTitle">
          <div className="panel-head">
            <h2 id="joinClassTitle">Join a class</h2>
          </div>
          <div className="panel-body">
            <form onSubmit={handleJoinSubmit} className="stack-form" noValidate>
              <label className="form-field" htmlFor="classJoinCodeInput">
                <span className="field-label">Class join code</span>
                <input
                  id="classJoinCodeInput"
                  name="joinCode"
                  type="text"
                  className="text-input mono-num"
                  placeholder="e.g. LNU-IT204B"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  autoComplete="off"
                  maxLength={20}
                  disabled={submitting}
                />
              </label>

              <p className="field-hint">
                Ask your instructor for your section’s code. Some sections require instructor approval before assigned activities unlock.
              </p>

              {error && (
                <div className="inline-alert inline-alert-error" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="inline-alert inline-alert-success" role="status">
                  {success}
                </div>
              )}

              <button type="submit" className="btn-primary btn-full" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Join class'}
              </button>
            </form>

            <div className="divider-line" />
            <div className="sample-codes-note">
              <p className="field-label">Available LNU lab sections</p>
              <p className="field-hint">
                <span className="mono-num">LNU-IT204B</span> (instructor approval) · <span className="mono-num">LNU-LAB205</span> (open enrollment)
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
