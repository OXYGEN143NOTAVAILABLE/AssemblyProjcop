import { useRef, useState } from 'react';
import { ArrowLeft, Lock, Pencil, Plus, Unlock } from 'lucide-react';
import {
  computeActivitySubmissionStats,
  getLockedStatusLabel,
} from '../domain/dashboardLogic';
import { ScheduleStatusBadge } from './ActivitySchedulesPanel';

export function ActivityDetailView({
  schedule,
  classroom,
  enableDemoControls = true,
  canAddStudent = enableDemoControls,
  onBack,
  onOpenClassroom,
  onToggleLock,
  onEditSchedule,
  onUpdateStudentScore,
  onSimulateSubmission,
  onAddStudent,
}) {
  const [draftScores, setDraftScores] = useState({});
  const committingKeysRef = useRef(new Set());

  const students = classroom?.students || [];
  const scores = schedule.scores || {};
  const { submittedCount, activityAvg } = computeActivitySubmissionStats(
    schedule,
    students
  );
  const allSubmitted = students.length > 0 && submittedCount >= students.length;
  const maxStudents = classroom?.capacity ?? 500;
  const isAtCapacity = Boolean(
    classroom && classroom.totalStudents >= maxStudents
  );

  const clearDraftKey = (draftKey, expectedValue) => {
    setDraftScores((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, draftKey)) return prev;
      if (expectedValue !== undefined && prev[draftKey] !== expectedValue) {
        return prev;
      }
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const commitDraftScore = async (studentId) => {
    const draftKey = `${schedule.id}:${studentId}`;
    if (committingKeysRef.current.has(draftKey)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(draftScores, draftKey)) {
      return;
    }

    const draftValue = draftScores[draftKey];
    const currentScore = scores[studentId];
    const currentString =
      typeof currentScore === 'number' && !Number.isNaN(currentScore)
        ? String(currentScore)
        : '';

    const trimmed = String(draftValue ?? '').trim();
    if (trimmed === '') {
      if (currentString === '') {
        clearDraftKey(draftKey, draftValue);
        return;
      }
      committingKeysRef.current.add(draftKey);
      try {
        await onUpdateStudentScore(schedule.id, studentId, '');
      } finally {
        committingKeysRef.current.delete(draftKey);
        clearDraftKey(draftKey, draftValue);
      }
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      clearDraftKey(draftKey, draftValue);
      return;
    }

    const clamped = Math.round(Math.max(0, Math.min(100, parsed)));
    if (typeof currentScore === 'number' && clamped === currentScore) {
      clearDraftKey(draftKey, draftValue);
      return;
    }

    committingKeysRef.current.add(draftKey);
    try {
      await onUpdateStudentScore(schedule.id, studentId, String(clamped));
    } finally {
      committingKeysRef.current.delete(draftKey);
      clearDraftKey(draftKey, draftValue);
    }
  };

  const handleImmediateScoreUpdate = (studentId, nextScore) => {
    const draftKey = `${schedule.id}:${studentId}`;
    clearDraftKey(draftKey);
    onUpdateStudentScore(schedule.id, studentId, nextScore);
  };

  return (
    <div className="subview-container">
      <div className="subview-actions">
        <button type="button" className="panel-link-btn" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </button>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {classroom && canAddStudent && (
            <button
              type="button"
              className="btn-secondary"
              disabled={isAtCapacity}
              onClick={() => onAddStudent(classroom.id)}
            >
              <Plus size={14} aria-hidden="true" />
              <span>+1 Student</span>
            </button>
          )}
          {enableDemoControls && (
            <button
              type="button"
              className="btn-secondary"
              disabled={Boolean(schedule.isLocked) || allSubmitted || students.length === 0}
              onClick={() => onSimulateSubmission(schedule.id)}
            >
              + Simulate Submission
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onToggleLock(schedule.id)}
          >
            {schedule.isLocked ? (
              <>
                <Unlock size={14} aria-hidden="true" />
                <span>Unlock</span>
              </>
            ) : (
              <>
                <Lock size={14} aria-hidden="true" />
                <span>Lock</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => onEditSchedule(schedule)}
          >
            <Pencil size={14} aria-hidden="true" />
            <span>Edit Activity</span>
          </button>
        </div>
      </div>

      <section className="panel" aria-label={`${schedule.activityName} summary`}>
        <div className="panel-header">
          <h2 className="panel-title">
            <span>{schedule.activityName}</span>
            <ScheduleStatusBadge
              status={schedule.status}
              isLocked={schedule.isLocked}
            />
          </h2>
          <span className="panel-count-pill">
            {schedule.day} {schedule.dateNum}
            {schedule.timeValue ? ` · ${schedule.timeValue}` : ''}
          </span>
        </div>

        <div className="detail-stats-grid">
          <div className="stat-box">
            <span className="metric-label">CLASSROOM</span>
            {classroom ? (
              <button
                type="button"
                className="panel-link-btn"
                style={{ padding: 0, justifyContent: 'flex-start' }}
                onClick={() => onOpenClassroom(classroom.id)}
              >
                {classroom.displayName}
              </button>
            ) : (
              <span className="metric-value">{schedule.className}</span>
            )}
          </div>

          <div className="stat-box">
            <span className="metric-label">STATUS</span>
            <div>
              <ScheduleStatusBadge
                status={schedule.status}
                isLocked={schedule.isLocked}
              />
            </div>
          </div>

          <div className="stat-box">
            <span className="metric-label">SUBMISSIONS</span>
            <span className="metric-value">
              {submittedCount} of {students.length}
            </span>
          </div>

          <div className="stat-box">
            <span className="metric-label">ACTIVITY AVERAGE</span>
            <span className="metric-value">{activityAvg}</span>
          </div>

          <div className="stat-box">
            <span className="metric-label">DUE DATE</span>
            <span className="metric-value">
              {schedule.dueDateLabel || 'Not set'}
            </span>
          </div>
        </div>
      </section>

      <section className="panel" aria-label="Student Scores">
        <div className="panel-header">
          <h2 className="panel-title">
            <span>Student Scores</span>
            <span className="panel-count-pill">{students.length} enrolled</span>
          </h2>
        </div>

        {schedule.isLocked && students.length > 0 && (
          <div className="submission-lock-note" role="status">
            Scores are locked because this activity is{' '}
            {getLockedStatusLabel(schedule.status)}. Unlock the activity above
            to record or edit student scores.
          </div>
        )}

        {students.length === 0 ? (
          <div className="schedules-empty">
            <p className="empty-state-text">
              {classroom && classroom.totalStudents > 0
                ? 'Individual student rows have not been loaded for this classroom.'
                : 'No students enrolled in this classroom yet'}
            </p>
            {classroom && canAddStudent && (
              <button
                type="button"
                className="btn-primary"
                disabled={isAtCapacity}
                onClick={() => onAddStudent(classroom.id)}
              >
                + Add Student
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="scores-table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Status</th>
                  <th scope="col">Score (0–100)</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const rawVal = scores[student.id];
                  const hasScore =
                    typeof rawVal === 'number' && !Number.isNaN(rawVal);
                  const draftKey = `${schedule.id}:${student.id}`;
                  const hasDraft = Object.prototype.hasOwnProperty.call(
                    draftScores,
                    draftKey
                  );
                  const persistedValue = hasScore ? String(rawVal) : '';
                  const inputValue =
                    !schedule.isLocked && hasDraft
                      ? draftScores[draftKey]
                      : persistedValue;

                  let statusPill;
                  if (hasScore) {
                    statusPill = (
                      <span className="status-pill status-pill--submitted">
                        Submitted
                      </span>
                    );
                  } else if (schedule.status === 'scheduled') {
                    statusPill = (
                      <span className="status-pill status-pill--neutral">
                        Not Started
                      </span>
                    );
                  } else if (schedule.status === 'closed') {
                    statusPill = (
                      <span className="status-pill status-pill--missing">
                        Missing
                      </span>
                    );
                  } else {
                    statusPill = (
                      <span className="status-pill status-pill--pending">
                        Pending
                      </span>
                    );
                  }

                  return (
                    <tr key={student.id}>
                      <td className="scores-student-name">{student.name}</td>
                      <td>{statusPill}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="score-input"
                          aria-label={`Score for ${student.name}`}
                          value={inputValue}
                          placeholder="—"
                          disabled={Boolean(schedule.isLocked)}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setDraftScores((prev) => ({
                              ...prev,
                              [draftKey]: nextValue,
                            }));
                          }}
                          onBlur={() => commitDraftScore(student.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitDraftScore(student.id);
                            } else if (e.key === 'Escape') {
                              clearDraftKey(draftKey);
                            }
                          }}
                        />
                      </td>
                      <td>
                        {hasScore ? (
                          <button
                            type="button"
                            className="btn-secondary btn-xs"
                            disabled={Boolean(schedule.isLocked)}
                            onClick={() =>
                              handleImmediateScoreUpdate(student.id, '')
                            }
                          >
                            Clear
                          </button>
                        ) : enableDemoControls ? (
                          <button
                            type="button"
                            className="btn-secondary btn-xs"
                            disabled={Boolean(schedule.isLocked)}
                            onClick={() =>
                              handleImmediateScoreUpdate(student.id, '85')
                            }
                          >
                            Grade 85%
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
