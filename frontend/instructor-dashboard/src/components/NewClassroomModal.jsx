import { useEffect, useRef, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { generateJoinCode } from '../domain/dashboardLogic';

function NewClassroomForm({ onAddClassroom, onClose }) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [joinCode, setJoinCode] = useState(() => generateJoinCode());
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const copyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(joinCode);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const handleRegenerate = () => {
    setJoinCode(generateJoinCode());
    setCopied(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setErrorMsg('');
    const parsedCap = parseInt(capacity, 10);
    const studentCapacity =
      Number.isNaN(parsedCap) || parsedCap <= 0 ? null : parsedCap;

    setIsSubmitting(true);
    try {
      await onAddClassroom({
        name: name.trim(),
        displayName: name.trim(),
        joinCode,
        submitted: 0,
        totalStudents: 0,
        capacity: studentCapacity,
        atRisk: 0,
        nextActivity: 'No Schedules',
        activityStatus: 'none',
        activeScheduleId: null,
        metricType: 'students',
        avgGrade: '—',
      });
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to create classroom.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        <div className="form-field">
          <label className="form-label" htmlFor="new-class-name">
            Classroom Name
          </label>
          <input
            id="new-class-name"
            className="form-input"
            type="text"
            placeholder="e.g. Class 7"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="new-class-students">
            Student Capacity (Optional)
          </label>
          <input
            id="new-class-students"
            className="form-input"
            type="number"
            min="1"
            max="500"
            placeholder="Optional (e.g. 30)"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>

        <div className="form-field">
          <span className="form-label">Classroom Code</span>
          <div className="join-code-box">
            <span className="join-code-value">{joinCode}</span>
            <div className="join-code-actions">
              <button
                type="button"
                className="btn-secondary join-code-btn"
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
              <button
                type="button"
                className="icon-btn"
                aria-label="Generate new classroom code"
                onClick={handleRegenerate}
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {errorMsg && (
          <p className="form-error" role="alert">
            {errorMsg}
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
          {isSubmitting ? 'Creating...' : 'Create Classroom'}
        </button>
      </div>
    </form>
  );
}

export function NewClassroomModal({ isOpen, onClose, onAddClassroom, nextIndex }) {
  return (
    <ModalDialog isOpen={isOpen} onClose={onClose} title="New Classroom">
      {isOpen && (
        <NewClassroomForm
          key={nextIndex}
          onAddClassroom={onAddClassroom}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
