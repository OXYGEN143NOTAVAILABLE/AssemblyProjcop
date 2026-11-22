import React, { useState } from 'react';
import { apiRequest, formatDateTime } from '../api.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

export function AccountView({
  user,
  classes,
  privacyRequests,
  sessionMinutesLeft,
  onPrivacyRequestAdded,
  onRequestSignOut,
}) {
  const [erasureOpen, setErasureOpen] = useState(false);
  const [erasureReason, setErasureReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleConfirmErasure() {
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const data = await apiRequest('/api/student/privacy/erasure-request', {
        method: 'POST',
        body: JSON.stringify({ reason: erasureReason.trim() }),
      });
      setErasureOpen(false);
      setErasureReason('');
      setSuccess(data.message || 'Personal data erasure request recorded.');
      if (data.request) {
        onPrivacyRequestAdded(data.request);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const approvedCount = classes.filter((c) => c.enrollmentStatus === 'approved').length;

  return (
    <section className="view-section" aria-labelledby="accountHeading">
      <header className="page-intro">
        <p className="section-kicker">Student identity &amp; security</p>
        <h1 id="accountHeading">Account &amp; privacy</h1>
        <p className="intro-copy">
          Review your institutional profile, active session timeout protection, and Data Privacy Act (RA 10173) controls.
        </p>
      </header>

      <div className="two-col-grid">
        <section className="panel" aria-labelledby="profileDetailsTitle">
          <div className="panel-head">
            <h2 id="profileDetailsTitle">Profile details</h2>
            <span className="head-attribution">BSIT Student Account</span>
          </div>
          <div className="panel-body">
            <dl className="profile-grid">
              <div className="profile-cell">
                <dt>Full name</dt>
                <dd>{user?.displayName || 'Student'}</dd>
              </div>
              <div className="profile-cell">
                <dt>School ID</dt>
                <dd className="mono-num">{user?.studentId || 'Not set'}</dd>
              </div>
              <div className="profile-cell">
                <dt>Institutional email</dt>
                <dd>{user?.email || 'Not set'}</dd>
              </div>
              <div className="profile-cell">
                <dt>Enrolled classes</dt>
                <dd className="mono-num">{approvedCount}</dd>
              </div>
            </dl>

            <div className="divider-line" />

            <div className="session-row">
              <div>
                <h3>Session security</h3>
                <p className="muted-copy">
                  Idle sessions expire automatically after <strong className="mono-num">30 minutes</strong> of inactivity.
                  {typeof sessionMinutesLeft === 'number'
                    ? ` Time remaining before idle sign-out: ${sessionMinutesLeft} min.`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={onRequestSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        <aside className="panel" aria-labelledby="privacyTitle">
          <div className="panel-head">
            <h2 id="privacyTitle">Data Privacy Act (RA 10173)</h2>
          </div>
          <div className="panel-body">
            <p className="muted-copy">
              Consent recorded at student registration. Assembly PC collects only institutional account details and classroom activity submissions required for instruction.
            </p>
            <p className="muted-copy mt-sm">
              You may request erasure of personal account data at any time, subject to Leyte Normal University’s retention obligations for academic grading and 1-year audit logs.
            </p>

            {error && (
              <div className="inline-alert inline-alert-error mt-md" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="inline-alert inline-alert-success mt-md" role="status">
                {success}
              </div>
            )}

            <div className="mt-md">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setError('');
                  setErasureOpen(true);
                }}
              >
                Request personal data erasure
              </button>
            </div>

            {privacyRequests.length > 0 && (
              <>
                <div className="divider-line" />
                <h3>Recorded privacy requests</h3>
                <ul className="privacy-req-list">
                  {privacyRequests.map((req) => (
                    <li key={req.id} className="privacy-req-item">
                      <div>
                        <strong>Personal data erasure</strong>
                        <p className="meta-line">
                          <span>Status: {req.status}</span>
                          {req.createdAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatDateTime(req.createdAt)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={erasureOpen}
        title="Confirm personal data erasure request"
        description="This logs a formal RA 10173 request for administrator processing. Academic evaluations and audit records required by institutional policy remain retained."
        confirmLabel="Submit erasure request"
        tone="danger"
        busy={submitting}
        onCancel={() => setErasureOpen(false)}
        onConfirm={handleConfirmErasure}
      >
        <label className="form-field mt-md" htmlFor="erasureReasonInput">
          <span className="field-label">Optional note</span>
          <input
            id="erasureReasonInput"
            type="text"
            className="text-input"
            placeholder="e.g. Course completed / graduated"
            value={erasureReason}
            onChange={(e) => setErasureReason(e.target.value)}
            maxLength={300}
            disabled={submitting}
          />
        </label>
      </ConfirmDialog>
    </section>
  );
}
