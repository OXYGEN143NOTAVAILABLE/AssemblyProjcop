import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

function InviteStudentForm({ classroom, onInviteStudent, onClose }) {
  const [identifier, setIdentifier] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isAuthError, setIsAuthError] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const joinCode = classroom?.joinCode || '';

  const handleCopyCode = () => {
    if (!joinCode) return;
    navigator.clipboard?.writeText(joinCode);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (isSubmitting) return;
    if (!trimmed) {
      setErrorMsg('Please enter a Student ID or email.');
      setIsAuthError(false);
      return;
    }
    if (!classroom || !onInviteStudent) return;

    setErrorMsg('');
    setIsAuthError(false);
    setIsSubmitting(true);
    try {
      await onInviteStudent(classroom.id, trimmed);
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to send invitation.');
      setIsAuthError(err?.status === 401);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        <div className="form-field">
          <span className="form-label">Classroom Code</span>
          <div className="join-code-box">
            <span className="join-code-value">{joinCode || '—'}</span>
            <div className="join-code-actions">
              <button
                type="button"
                className="btn-secondary join-code-btn"
                disabled={!joinCode}
                onClick={handleCopyCode}
              >
                {copied ? (
                  <>
                    <Check size={14} aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Classroom code copied to clipboard' : ''}
              </span>
            </div>
          </div>
          <span className="form-hint">
            Share this join code with students, or invite a specific student directly below.
          </span>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="invite-student-identifier">
            Student ID or Email
          </label>
          <input
            id="invite-student-identifier"
            name="identifier"
            className="form-input"
            type="text"
            placeholder="e.g. 2024-00123 or student@school.edu"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (errorMsg) {
                setErrorMsg('');
                setIsAuthError(false);
              }
            }}
            disabled={isSubmitting}
            autoFocus
            required
          />
        </div>

        {errorMsg && (
          <p className="form-error" role="alert">
            {errorMsg}
            {isAuthError && (
              <>
                {' '}
                <a href="/" className="dashboard-feedback-link">
                  Sign in again
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <div className="modal-footer">
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </form>
  );
}

export function InviteStudentModal({
  isOpen,
  onClose,
  classroom,
  onInviteStudent,
}) {
  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} title="Invite Student">
      {isOpen && (
        <InviteStudentForm
          key={classroom?.id || 'invite'}
          classroom={classroom}
          onInviteStudent={onInviteStudent}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
