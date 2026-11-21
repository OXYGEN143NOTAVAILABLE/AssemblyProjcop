import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import {
  computeActivitySubmissionStats,
  computeStudentSummaries,
  getLockedStatusLabel,
  getNowDateTimeString,
  getTimeOfDayGreeting,
  reconcileSchedulesWithClasses,
  syncClassesNextActivity,
} from './domain/dashboardLogic';
import { createInMemoryDashboardAdapter } from './adapters/placeholderAdapter';
import { Sidebar } from './components/Sidebar';
import { ClassCard } from './components/ClassCard';
import {
  ActivitySchedulesPanel,
  ScheduleStatusBadge,
} from './components/ActivitySchedulesPanel';
import { ActivityDetailView } from './components/ActivityDetailView';
import { ScheduleActivityModal } from './components/ScheduleActivityModal';
import { NewClassroomModal } from './components/NewClassroomModal';
import { InviteStudentModal } from './components/InviteStudentModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import './App.css';

const EMPTY_LIST = [];

export function InstructorDashboard({
  classes: controlledClasses,
  schedules: controlledSchedules,
  instructorName: controlledInstructorName,
  initialClasses = EMPTY_LIST,
  initialSchedules = EMPTY_LIST,
  initialInstructorName = 'Instructor Name',
  onClassesChange,
  onSchedulesChange,
  onInstructorNameChange,
  adapter: providedAdapter,
  enableDemoControls = false,
  showSidebar = true,
  activeView: controlledActiveView,
  onViewChange,
  isLoading = false,
  error = null,
  lifecycleCheckIntervalMs = 15000,
  className = '',
} = {}) {
  const isClassesControlled = controlledClasses !== undefined;
  const isSchedulesControlled = controlledSchedules !== undefined;
  const isNameControlled = controlledInstructorName !== undefined;
  const isViewControlled = controlledActiveView !== undefined;

  const [fallbackAdapter] = useState(() => createInMemoryDashboardAdapter());
  const activeAdapter = providedAdapter || fallbackAdapter;

  const [internalClasses, setInternalClasses] = useState(initialClasses);
  const [internalSchedules, setInternalSchedules] = useState(initialSchedules);
  const [internalInstructorName, setInternalInstructorName] = useState(
    initialInstructorName
  );
  const [internalView, setInternalView] = useState('home');
  const [nowTick, setNowTick] = useState(() => getNowDateTimeString());

  const [isLoadingInitial, setIsLoadingInitial] = useState(() =>
    Boolean(
      providedAdapter?.loadInitialData &&
        !isClassesControlled &&
        !isSchedulesControlled
    )
  );
  const [actionError, setActionError] = useState(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  const [classDetailTab, setClassDetailTab] = useState('activities');
  const [previousView, setPreviousView] = useState('home');
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState(null);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDefaultClassId, setScheduleDefaultClassId] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [deletingSchedule, setDeletingSchedule] = useState(null);
  const [newClassModalOpen, setNewClassModalOpen] = useState(false);
  const [inviteClassId, setInviteClassId] = useState(null);
  const [copiedClassId, setCopiedClassId] = useState(null);
  const copyTimerRef = useRef(null);

  const rawClasses = isClassesControlled ? controlledClasses : internalClasses;
  const rawSchedules = isSchedulesControlled
    ? controlledSchedules
    : internalSchedules;
  const instructorName = isNameControlled
    ? controlledInstructorName
    : internalInstructorName;
  const activeView = isViewControlled ? controlledActiveView : internalView;

  const rawClassesRef = useRef(rawClasses);
  const rawSchedulesRef = useRef(rawSchedules);

  useEffect(() => {
    rawClassesRef.current = rawClasses;
  }, [rawClasses]);

  useEffect(() => {
    rawSchedulesRef.current = rawSchedules;
  }, [rawSchedules]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lifecycleCheckIntervalMs || lifecycleCheckIntervalMs <= 0) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNowTick(getNowDateTimeString());
    }, lifecycleCheckIntervalMs);
    return () => clearInterval(timer);
  }, [lifecycleCheckIntervalMs]);

  const setActiveView = useCallback(
    (nextView) => {
      if (!isViewControlled) {
        setInternalView(nextView);
      }
      onViewChange?.(nextView);
    },
    [isViewControlled, onViewChange]
  );

  const commitClassesAndSchedules = useCallback(
    (nextRawClasses, nextRawSchedules) => {
      const nowStr = getNowDateTimeString();
      setNowTick(nowStr);
      const nextSchedulesReconciled = reconcileSchedulesWithClasses(
        nextRawSchedules,
        nextRawClasses,
        nowStr
      );
      const nextClassesSynced = syncClassesNextActivity(
        nextRawClasses,
        nextSchedulesReconciled
      );

      rawClassesRef.current = nextClassesSynced;
      rawSchedulesRef.current = nextSchedulesReconciled;

      if (!isClassesControlled) {
        setInternalClasses(nextClassesSynced);
      }
      if (!isSchedulesControlled) {
        setInternalSchedules(nextSchedulesReconciled);
      }
      onClassesChange?.(nextClassesSynced);
      onSchedulesChange?.(nextSchedulesReconciled);

      return {
        classes: nextClassesSynced,
        schedules: nextSchedulesReconciled,
      };
    },
    [
      isClassesControlled,
      isSchedulesControlled,
      onClassesChange,
      onSchedulesChange,
    ]
  );

  const clearActionError = useCallback(() => {
    setActionError(null);
    setIsSessionExpired(false);
  }, []);

  const handleAdapterError = useCallback((err, fallbackMessage) => {
    if (err?.status === 401) {
      setIsSessionExpired(true);
      setActionError(
        err?.message || 'Your session has expired. Please sign in again.'
      );
      return;
    }
    setIsSessionExpired(false);
    setActionError(err?.message || fallbackMessage);
  }, []);

  useEffect(() => {
    if (
      !providedAdapter?.loadInitialData ||
      isClassesControlled ||
      isSchedulesControlled
    ) {
      return undefined;
    }

    let cancelled = false;
    providedAdapter
      .loadInitialData()
      .then((data) => {
        if (cancelled || !data) return;
        const loadedClasses = Array.isArray(data.classes) ? data.classes : [];
        const loadedSchedules = Array.isArray(data.schedules)
          ? data.schedules
          : [];
        commitClassesAndSchedules(loadedClasses, loadedSchedules);
        if (typeof data.instructorName === 'string' && !isNameControlled) {
          setInternalInstructorName(data.instructorName);
        }
        clearActionError();
      })
      .catch((err) => {
        if (!cancelled) {
          handleAdapterError(err, 'Failed to load dashboard data.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingInitial(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    providedAdapter,
    isClassesControlled,
    isSchedulesControlled,
    isNameControlled,
    commitClassesAndSchedules,
    clearActionError,
    handleAdapterError,
  ]);

  const schedules = useMemo(
    () => reconcileSchedulesWithClasses(rawSchedules, rawClasses, nowTick),
    [rawSchedules, rawClasses, nowTick]
  );

  const classes = useMemo(
    () => syncClassesNextActivity(rawClasses, schedules),
    [rawClasses, schedules]
  );

  const handleCopyJoinCode = (classId, code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedClassId(classId);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedClassId(null), 1500);
  };

  const handleOpenScheduleModal = (classId = null) => {
    setEditingSchedule(null);
    setScheduleDefaultClassId(classId);
    setScheduleModalOpen(true);
  };

  const handleOpenEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleModalOpen(true);
  };

  const handleSelectClass = (classId) => {
    setSelectedClassId(classId);
    setClassDetailTab('activities');
    setActiveView('class-detail');
  };

  const handleSelectSchedule = (scheduleId) => {
    setPreviousView(activeView === 'activity-detail' ? previousView : activeView);
    setSelectedScheduleId(scheduleId);
    setActiveView('activity-detail');
  };

  const handleSaveSchedule = async (scheduleData) => {
    clearActionError();
    const existing = scheduleData.id
      ? rawSchedulesRef.current.find((s) => s.id === scheduleData.id)
      : null;
    const classChanged = Boolean(
      existing && existing.classId !== scheduleData.classId
    );
    const payload = scheduleData.id
      ? {
          ...existing,
          ...scheduleData,
          ...(classChanged ? { scores: {}, submitted: 0 } : {}),
        }
      : { scores: {}, ...scheduleData };

    try {
      const saved = activeAdapter.saveSchedule
        ? await activeAdapter.saveSchedule(payload)
        : { ...payload, id: payload.id || `sched-${Date.now()}` };

      const exists = Boolean(
        existing || rawSchedulesRef.current.some((s) => s.id === saved.id)
      );
      const nextRawSchedules = exists
        ? rawSchedulesRef.current.map((s) => (s.id === saved.id ? saved : s))
        : [saved, ...rawSchedulesRef.current];
      commitClassesAndSchedules(rawClassesRef.current, nextRawSchedules);
    } catch (err) {
      if (err?.status === 401) {
        handleAdapterError(err, 'Unable to save scheduled activity.');
      }
      throw err;
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      clearActionError();
      if (activeAdapter.deleteSchedule) {
        await activeAdapter.deleteSchedule(scheduleId);
      }
      const nextRawSchedules = rawSchedulesRef.current.filter(
        (s) => s.id !== scheduleId
      );
      commitClassesAndSchedules(rawClassesRef.current, nextRawSchedules);

      if (selectedScheduleId === scheduleId) {
        setSelectedScheduleId(null);
        if (activeView === 'activity-detail') {
          setActiveView(
            previousView === 'activity-detail' ? 'schedules' : previousView
          );
        }
      }
    } catch (err) {
      handleAdapterError(err, 'Unable to delete scheduled activity.');
    }
  };

  const handleToggleScheduleLock = async (scheduleId) => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return;
    const nextLocked = !target.isLocked;
    try {
      clearActionError();
      const patch = activeAdapter.toggleScheduleLock
        ? await activeAdapter.toggleScheduleLock(scheduleId, nextLocked)
        : { isLocked: nextLocked, manualOverride: true };

      const nextRawSchedules = rawSchedulesRef.current.map((s) =>
        s.id === scheduleId
          ? {
              ...s,
              isLocked: nextLocked,
              manualOverride: true,
              ...(patch && typeof patch === 'object' ? patch : {}),
            }
          : s
      );
      commitClassesAndSchedules(rawClassesRef.current, nextRawSchedules);
    } catch (err) {
      handleAdapterError(err, 'Unable to update activity lock state.');
    }
  };

  const handleAddClassroom = async (newClass) => {
    clearActionError();
    try {
      const created = activeAdapter.createClassroom
        ? await activeAdapter.createClassroom(newClass)
        : {
            id: `class-${Date.now()}`,
            students: [],
            invitations: [],
            ...newClass,
          };

      const nextRawClasses = [created, ...rawClassesRef.current];
      commitClassesAndSchedules(nextRawClasses, rawSchedulesRef.current);
    } catch (err) {
      if (err?.status === 401) {
        handleAdapterError(err, 'Unable to create classroom.');
      }
      throw err;
    }
  };

  const handleUpdateStudentScore = async (scheduleId, studentId, rawScore) => {
    let normalizedScore = null;
    if (rawScore !== '' && rawScore !== null && rawScore !== undefined) {
      const parsed = Number(rawScore);
      if (Number.isNaN(parsed)) return;
      normalizedScore = Math.round(Math.max(0, Math.min(100, parsed)));
    }

    try {
      clearActionError();
      const persistedScore = activeAdapter.updateStudentScore
        ? await activeAdapter.updateStudentScore(
            scheduleId,
            studentId,
            normalizedScore
          )
        : normalizedScore;
      const finalScore =
        persistedScore === undefined ? normalizedScore : persistedScore;

      const nextRawSchedules = rawSchedulesRef.current.map((s) => {
        if (s.id !== scheduleId) return s;
        const nextScores = { ...(s.scores || {}) };
        if (
          finalScore === null ||
          finalScore === undefined ||
          Number.isNaN(finalScore)
        ) {
          delete nextScores[studentId];
        } else {
          nextScores[studentId] = finalScore;
        }
        return { ...s, scores: nextScores };
      });
      commitClassesAndSchedules(rawClassesRef.current, nextRawSchedules);
    } catch (err) {
      handleAdapterError(err, 'Unable to update student score.');
    }
  };

  const handleSimulateSubmission = async (scheduleId) => {
    const targetSched = schedules.find((s) => s.id === scheduleId);
    if (!targetSched || targetSched.isLocked) return;

    const targetClass = classes.find((c) => c.id === targetSched.classId);
    if (!targetClass || !activeAdapter.simulateSubmission) return;

    try {
      clearActionError();
      const result = await activeAdapter.simulateSubmission(
        targetSched,
        targetClass
      );
      if (result?.studentId !== undefined) {
        await handleUpdateStudentScore(
          scheduleId,
          result.studentId,
          String(result.score)
        );
      }
    } catch (err) {
      handleAdapterError(err, 'Unable to simulate submission.');
    }
  };

  const handleAdjustSubmissions = async (classId, delta) => {
    const targetClass = classes.find((c) => c.id === classId);
    if (!targetClass || !targetClass.activeScheduleId) return;

    const activeSched = schedules.find(
      (s) => s.id === targetClass.activeScheduleId
    );
    if (!activeSched || activeSched.isLocked) return;

    if (delta > 0) {
      await handleSimulateSubmission(activeSched.id);
      return;
    }

    if (!activeAdapter.decrementSubmission) return;
    try {
      clearActionError();
      const result = await activeAdapter.decrementSubmission(
        activeSched,
        targetClass
      );
      if (result?.studentId) {
        await handleUpdateStudentScore(activeSched.id, result.studentId, '');
      }
    } catch (err) {
      handleAdapterError(err, 'Unable to remove submission.');
    }
  };

  const applyRosterPatch = (classId, patch) => {
    const nextRawClasses = rawClassesRef.current.map((cls) =>
      cls.id === classId ? { ...cls, ...patch } : cls
    );
    const updatedCls = nextRawClasses.find((c) => c.id === classId);
    const nextStudents = updatedCls?.students;
    const nextRawSchedules = Array.isArray(nextStudents)
      ? rawSchedulesRef.current.map((s) => {
          if (s.classId !== classId) return s;
          const validIds = new Set(nextStudents.map((st) => st.id));
          const prunedScores = Object.fromEntries(
            Object.entries(s.scores || {}).filter(([id]) => validIds.has(id))
          );
          return { ...s, scores: prunedScores };
        })
      : rawSchedulesRef.current;

    commitClassesAndSchedules(nextRawClasses, nextRawSchedules);
  };

  const handleAdjustStudents = async (classId, delta) => {
    const targetClass = classes.find((c) => c.id === classId);
    if (!targetClass) return;

    const handler =
      delta > 0 && providedAdapter?.addStudent && !enableDemoControls
        ? (cls) => providedAdapter.addStudent(cls)
        : activeAdapter.adjustStudents
          ? (cls) => activeAdapter.adjustStudents(cls, delta)
          : null;
    if (!handler) return;

    try {
      clearActionError();
      const patch = await handler(targetClass);
      if (!patch || typeof patch !== 'object') return;
      applyRosterPatch(classId, patch);
    } catch (err) {
      handleAdapterError(err, 'Unable to update classroom roster.');
    }
  };

  const handleRemoveStudent = async (classId, studentId) => {
    const targetClass = classes.find((c) => c.id === classId);
    if (!targetClass || !activeAdapter.removeStudent) return;

    try {
      clearActionError();
      const patch = await activeAdapter.removeStudent(targetClass, studentId);
      if (!patch || typeof patch !== 'object') return;
      applyRosterPatch(classId, patch);
    } catch (err) {
      handleAdapterError(err, 'Unable to remove student.');
    }
  };

  const handleInviteStudent = async (classId, identifier) => {
    const targetClass = rawClassesRef.current.find((c) => c.id === classId);
    if (!targetClass || !activeAdapter.inviteStudent) return;

    clearActionError();
    try {
      const patch = await activeAdapter.inviteStudent(targetClass, identifier);
      if (patch && typeof patch === 'object') {
        applyRosterPatch(classId, patch);
      }
    } catch (err) {
      if (err?.status === 401) {
        handleAdapterError(err, 'Unable to send invitation.');
      }
      throw err;
    }
  };

  const handleCancelInvitation = async (classId, invitationId) => {
    const targetClass = rawClassesRef.current.find((c) => c.id === classId);
    if (!targetClass || !activeAdapter.cancelInvitation) return;

    try {
      clearActionError();
      const patch = await activeAdapter.cancelInvitation(
        targetClass,
        invitationId
      );
      if (patch && typeof patch === 'object') {
        applyRosterPatch(classId, patch);
      } else {
        const nextInvitations = (targetClass.invitations || []).filter(
          (inv) => inv.id !== invitationId
        );
        applyRosterPatch(classId, { invitations: nextInvitations });
      }
    } catch (err) {
      handleAdapterError(err, 'Unable to cancel invitation.');
    }
  };

  const handleUpdateInstructorName = async (name) => {
    try {
      clearActionError();
      const persisted = activeAdapter.updateInstructorName
        ? await activeAdapter.updateInstructorName(name)
        : name;
      const resolvedName =
        typeof persisted === 'string' && persisted.trim()
          ? persisted.trim()
          : name;
      if (!isNameControlled) {
        setInternalInstructorName(resolvedName);
      }
      onInstructorNameChange?.(resolvedName);
    } catch (err) {
      handleAdapterError(err, 'Unable to update instructor name.');
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedClassSchedules = selectedClass
    ? schedules.filter((s) => s.classId === selectedClass.id)
    : [];
  const selectedClassStudentSummaries = selectedClass
    ? computeStudentSummaries(selectedClass.students, selectedClassSchedules)
    : [];
  const activeSchedule = selectedClass
    ? schedules.find((s) => s.id === selectedClass.activeScheduleId) || null
    : null;
  const isCurrentActivityLocked =
    !activeSchedule || Boolean(activeSchedule.isLocked);
  const selectedClassMaxStudents = selectedClass
    ? (selectedClass.capacity ?? 500)
    : 500;
  const isSelectedClassAtCapacity = Boolean(
    selectedClass && selectedClass.totalStudents >= selectedClassMaxStudents
  );
  const canDecrementSubmission = Boolean(
    activeSchedule &&
      !activeSchedule.isLocked &&
      selectedClass &&
      selectedClass.submitted > 0
  );
  const canIncrementSubmission = Boolean(
    activeSchedule &&
      !activeSchedule.isLocked &&
      selectedClass &&
      selectedClass.totalStudents > 0 &&
      selectedClass.submitted < selectedClass.totalStudents
  );

  const canAddStudent =
    enableDemoControls || Boolean(providedAdapter?.addStudent);
  const canRemoveStudent =
    enableDemoControls || Boolean(providedAdapter?.removeStudent);
  const canInviteStudent = Boolean(providedAdapter?.inviteStudent);
  const canCancelInvitation = Boolean(providedAdapter?.cancelInvitation);
  const inviteClassroom = classes.find((c) => c.id === inviteClassId) || null;

  const selectedSchedule =
    schedules.find((s) => s.id === selectedScheduleId) || null;
  const selectedScheduleClass = selectedSchedule
    ? classes.find((c) => c.id === selectedSchedule.classId) || null
    : null;

  const visibleHomeSchedules = schedules.filter((s) => s.status !== 'closed');
  const upcomingSchedulesCount = schedules.filter(
    (s) => s.status === 'scheduled' || s.status === 'active'
  ).length;
  const totalEnrolledStudents = classes.reduce(
    (sum, cls) => sum + cls.totalStudents,
    0
  );
  const activeClassesCount = classes.filter(
    (cls) => cls.activityStatus === 'active'
  ).length;

  const effectiveLoading = Boolean(isLoading || isLoadingInitial);
  const effectiveError = error || actionError;

  const renderEditableSchedules = (items, defaultClassId = null) => (
    <div className="schedules-list">
      {items.length === 0 ? (
        <div className="schedules-empty">
          <p className="empty-state-text">No Schedules</p>
          <button
            type="button"
            className="btn-secondary"
            disabled={classes.length === 0}
            onClick={() => handleOpenScheduleModal(defaultClassId)}
          >
            + Schedule Activity
          </button>
        </div>
      ) : (
        items.map((item) => {
          const targetClass = classes.find((c) => c.id === item.classId);
          const students = targetClass?.students || [];
          const totalStudents = targetClass?.totalStudents ?? 0;
          const { submittedCount } = computeActivitySubmissionStats(
            item,
            students
          );

          return (
            <div
              key={item.id}
              className="schedule-row schedule-row--editable schedule-row--clickable"
              onClick={() => handleSelectSchedule(item.id)}
            >
              <div className="schedule-date">
                <span className="schedule-day">{item.day}</span>
                <span className="schedule-num">{item.dateNum}</span>
              </div>
              <div className="schedule-info">
                <span className="schedule-class">{item.className}</span>
                <div className="schedule-activity-row">
                  <button
                    type="button"
                    className="schedule-open-btn"
                    aria-label={`Open scores for ${item.activityName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectSchedule(item.id);
                    }}
                  >
                    {item.activityName}
                  </button>
                  <ScheduleStatusBadge
                    status={item.status}
                    isLocked={item.isLocked}
                  />
                </div>
                <span className="schedule-due">
                  {item.timeValue ? `${item.timeValue} · ` : ''}
                  {item.dueDateLabel ? `Due ${item.dueDateLabel} · ` : ''}
                  {submittedCount} of {totalStudents} submitted
                </span>
              </div>
              <div className="schedule-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={
                    item.isLocked
                      ? `Unlock ${item.activityName}`
                      : `Lock ${item.activityName}`
                  }
                  aria-pressed={Boolean(item.isLocked)}
                  title={item.isLocked ? 'Unlock activity' : 'Lock activity'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleScheduleLock(item.id);
                  }}
                >
                  {item.isLocked ? (
                    <Lock size={15} aria-hidden="true" />
                  ) : (
                    <Unlock size={15} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${item.activityName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEditSchedule(item);
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={`Delete ${item.activityName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingSchedule(item);
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderClassGrid = (items) =>
    items.length === 0 ? (
      <div className="schedules-empty">
        <p className="empty-state-text">No Classrooms</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setNewClassModalOpen(true)}
        >
          + New Classroom
        </button>
      </div>
    ) : (
      <div className="classes-grid">
        {items.map((cls) => (
          <ClassCard
            key={cls.id}
            cls={cls}
            onSelectClass={handleSelectClass}
            onQuickAddActivity={handleOpenScheduleModal}
          />
        ))}
      </div>
    );

  const rootClassName = [
    'app-shell',
    'apc-dashboard',
    showSidebar ? '' : 'app-shell--no-sidebar',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      {showSidebar && (
        <Sidebar
          classes={classes}
          activeView={activeView}
          selectedClassId={selectedClassId}
          onNavigate={setActiveView}
          onSelectClass={handleSelectClass}
          instructorName={instructorName}
          onUpdateInstructorName={handleUpdateInstructorName}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="hero-eyebrow">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              INSTRUCTOR DASHBOARD
            </span>
            <h1 className="greeting">
              {getTimeOfDayGreeting()}, {instructorName}
            </h1>
            <p className="hero-subtitle">
              {classes.length} {classes.length === 1 ? 'class' : 'classes'} ·{' '}
              {totalEnrolledStudents}{' '}
              {totalEnrolledStudents === 1 ? 'student' : 'students'} ·{' '}
              {schedules.length}{' '}
              {schedules.length === 1 ? 'activity' : 'activities'} scheduled
            </p>
          </div>
          <div className="hero-actions">
            <span className="live-indicator-pill">
              <span className="hero-eyebrow-dot" aria-hidden="true" />
              {activeClassesCount}{' '}
              {activeClassesCount === 1 ? 'class' : 'classes'} active now
            </span>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setNewClassModalOpen(true)}
            >
              + New Classroom
            </button>
          </div>
        </header>

        {effectiveError && (
          <div
            className="dashboard-feedback-banner dashboard-feedback-banner--error"
            role="alert"
          >
            <span>
              {effectiveError}
              {isSessionExpired && !error && (
                <>
                  {' '}
                  <a href="/" className="dashboard-feedback-link">
                    Return to sign in
                  </a>
                </>
              )}
            </span>
            {!error && actionError && (
              <button
                type="button"
                className="btn-secondary btn-xs"
                onClick={clearActionError}
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {effectiveLoading && (
          <div className="dashboard-feedback-banner" role="status">
            <span>Loading dashboard data...</span>
          </div>
        )}

        {activeView === 'home' && (
          <div className="dashboard-content">
            <section className="panel" aria-label="Your Classes">
              <div className="panel-header">
                <h2 className="panel-title">
                  <span>Your Classes</span>
                  <span className="panel-count-pill">{classes.length}</span>
                </h2>
                <button
                  type="button"
                  className="panel-link-btn"
                  onClick={() => setActiveView('classrooms')}
                >
                  <span>View All</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>

              {renderClassGrid(classes.slice(0, 6))}
            </section>

            <ActivitySchedulesPanel
              schedules={visibleHomeSchedules.slice(0, 9)}
              classes={classes}
              upcomingCount={upcomingSchedulesCount}
              onViewAll={() => setActiveView('schedules')}
              onScheduleClick={() => handleOpenScheduleModal(null)}
              onSelectSchedule={handleSelectSchedule}
              hasClasses={classes.length > 0}
            />
          </div>
        )}

        {activeView === 'classrooms' && (
          <div className="subview-container">
            <div className="subview-actions">
              <button
                type="button"
                className="panel-link-btn"
                onClick={() => setActiveView('home')}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back to Dashboard</span>
              </button>
            </div>

            <section className="panel" aria-label="All Classrooms">
              <div className="panel-header">
                <h2 className="panel-title">All Classrooms ({classes.length})</h2>
              </div>
              {renderClassGrid(classes)}
            </section>
          </div>
        )}

        {activeView === 'schedules' && (
          <div className="subview-container">
            <div className="subview-actions">
              <button
                type="button"
                className="panel-link-btn"
                onClick={() => setActiveView('home')}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back to Dashboard</span>
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={classes.length === 0}
                onClick={() => handleOpenScheduleModal(null)}
              >
                + Schedule Activity
              </button>
            </div>

            <section className="panel" aria-label="All Activity Schedules">
              <div className="panel-header">
                <h2 className="panel-title">Activity Schedules ({schedules.length})</h2>
              </div>
              {renderEditableSchedules(schedules)}
            </section>
          </div>
        )}

        {activeView === 'class-detail' && selectedClass && (
          <div className="subview-container">
            <div className="subview-actions">
              <button
                type="button"
                className="panel-link-btn"
                onClick={() => setActiveView('home')}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back to Dashboard</span>
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => handleOpenScheduleModal(selectedClass.id)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>Schedule for {selectedClass.name}</span>
              </button>
            </div>

            <section className="panel" aria-label={`${selectedClass.name} details`}>
              <div className="panel-header">
                <h2 className="panel-title">
                  <span>{selectedClass.displayName}</span>
                  {selectedClass.activityStatus &&
                    selectedClass.activityStatus !== 'none' && (
                      <ScheduleStatusBadge status={selectedClass.activityStatus} />
                    )}
                </h2>
                {enableDemoControls && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={selectedClass.totalStudents <= 0}
                      onClick={() => handleAdjustStudents(selectedClass.id, -1)}
                    >
                      -1 Student
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isSelectedClassAtCapacity}
                      onClick={() => handleAdjustStudents(selectedClass.id, 1)}
                    >
                      +1 Student
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!canDecrementSubmission}
                      onClick={() => handleAdjustSubmissions(selectedClass.id, -1)}
                    >
                      -1 Submission
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!canIncrementSubmission}
                      onClick={() => handleAdjustSubmissions(selectedClass.id, 1)}
                    >
                      +1 Submission
                    </button>
                  </div>
                )}
              </div>

              {isCurrentActivityLocked && (
                <div className="submission-lock-note" role="status">
                  {!activeSchedule
                    ? 'Schedule an activity to track student submissions.'
                    : `Submissions are disabled while the current activity is ${getLockedStatusLabel(
                        activeSchedule.status
                      )}.`}
                </div>
              )}

              <div className="detail-stats-grid">
                <div className="stat-box">
                  <span className="metric-label">ENROLLED STUDENTS</span>
                  <span className="metric-value">
                    {selectedClass.totalStudents}
                    {selectedClass.capacity ? ` / ${selectedClass.capacity} limit` : ''}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="metric-label">SUBMISSIONS</span>
                  <span className="metric-value">
                    {selectedClass.submitted} of {selectedClass.totalStudents}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="metric-label">AT-RISK STUDENTS</span>
                  <span className="metric-value">{selectedClass.atRisk}</span>
                </div>
                <div className="stat-box">
                  <span className="metric-label">NEXT ACTIVITY</span>
                  <span className="metric-value">{selectedClass.nextActivity}</span>
                </div>
                <div className="stat-box">
                  <span className="metric-label">AVG GRADE</span>
                  <span className="metric-value">{selectedClass.avgGrade}</span>
                </div>
                <div className="stat-box">
                  <span className="metric-label">CLASSROOM CODE</span>
                  <div className="stat-box-row">
                    <span className="metric-value join-code-value">
                      {selectedClass.joinCode}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Copy classroom code"
                      onClick={() =>
                        handleCopyJoinCode(selectedClass.id, selectedClass.joinCode)
                      }
                    >
                      {copiedClassId === selectedClass.id ? (
                        <Check size={15} aria-hidden="true" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )}
                    </button>
                    <span className="sr-only" aria-live="polite">
                      {copiedClassId === selectedClass.id
                        ? 'Classroom code copied to clipboard'
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel" aria-label="Classroom Details Tabs">
              <div className="panel-header">
                <div
                  className="panel-tabs"
                  role="tablist"
                  aria-label="Classroom sections"
                >
                  <button
                    type="button"
                    role="tab"
                    id="tab-activities"
                    aria-controls="panel-class-detail-tab"
                    aria-selected={classDetailTab === 'activities'}
                    className={`panel-tab-btn ${
                      classDetailTab === 'activities' ? 'is-active' : ''
                    }`}
                    onClick={() => setClassDetailTab('activities')}
                  >
                    <span>Scheduled Activities</span>
                    <span className="panel-count-pill">
                      {selectedClassSchedules.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="tab-students"
                    aria-controls="panel-class-detail-tab"
                    aria-selected={classDetailTab === 'students'}
                    className={`panel-tab-btn ${
                      classDetailTab === 'students' ? 'is-active' : ''
                    }`}
                    onClick={() => setClassDetailTab('students')}
                  >
                    <span>Students List</span>
                    <span className="panel-count-pill">
                      {selectedClass.students.length > 0
                        ? selectedClass.students.length
                        : selectedClass.totalStudents}
                    </span>
                  </button>
                </div>
                {classDetailTab === 'students' &&
                  canInviteStudent &&
                  selectedClass.students.length > 0 && (
                    <button
                      type="button"
                      className="btn-primary btn-xs"
                      disabled={isSelectedClassAtCapacity}
                      title={
                        isSelectedClassAtCapacity
                          ? 'Classroom has reached student capacity'
                          : undefined
                      }
                      onClick={() => setInviteClassId(selectedClass.id)}
                    >
                      + Invite Student
                    </button>
                  )}
              </div>

              <div
                id="panel-class-detail-tab"
                role="tabpanel"
                aria-labelledby={
                  classDetailTab === 'activities' ? 'tab-activities' : 'tab-students'
                }
              >
                {classDetailTab === 'activities' ? (
                  renderEditableSchedules(selectedClassSchedules, selectedClass.id)
                ) : (
                  <>
                    {selectedClass.students.length === 0 ? (
                      <div className="schedules-empty">
                        <p className="empty-state-text">
                          {selectedClass.totalStudents > 0
                            ? 'Individual student rows have not been loaded for this classroom.'
                            : 'No students enrolled in this classroom yet'}
                        </p>
                        {(canInviteStudent ||
                          (canAddStudent && selectedClass.totalStudents === 0)) && (
                          <div className="empty-state-actions">
                            {canInviteStudent && (
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={isSelectedClassAtCapacity}
                                title={
                                  isSelectedClassAtCapacity
                                    ? 'Classroom has reached student capacity'
                                    : undefined
                                }
                                onClick={() => setInviteClassId(selectedClass.id)}
                              >
                                + Invite Student
                              </button>
                            )}
                            {canAddStudent && selectedClass.totalStudents === 0 && (
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={isSelectedClassAtCapacity}
                                onClick={() => handleAdjustStudents(selectedClass.id, 1)}
                              >
                                + Add Student
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table className="scores-table">
                          <thead>
                            <tr>
                              <th scope="col">Student</th>
                              <th scope="col">Activities Submitted</th>
                              <th scope="col">Overall Average</th>
                              <th scope="col">Status</th>
                              {canRemoveStudent && <th scope="col">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {selectedClassStudentSummaries.map(
                              ({
                                student,
                                submittedCount,
                                totalActivities,
                                overallAvg,
                                status,
                              }) => (
                                <tr key={student.id}>
                                  <td className="scores-student-name">
                                    <div>{student.name}</div>
                                    {(student.schoolId || student.email) && (
                                      <div className="student-meta">
                                        {[student.schoolId, student.email]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {submittedCount} of {totalActivities}
                                  </td>
                                  <td>{overallAvg}</td>
                                  <td>
                                    {status === 'at-risk' ? (
                                      <span className="status-pill status-pill--missing">
                                        At-Risk
                                      </span>
                                    ) : status === 'on-track' ? (
                                      <span className="status-pill status-pill--submitted">
                                        On Track
                                      </span>
                                    ) : (
                                      <span className="status-pill status-pill--neutral">
                                        Enrolled
                                      </span>
                                    )}
                                  </td>
                                  {canRemoveStudent && (
                                    <td>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-xs"
                                        onClick={() =>
                                          handleRemoveStudent(
                                            selectedClass.id,
                                            student.id
                                          )
                                        }
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {selectedClass.invitations?.length > 0 && (
                      <div className="pending-invitations-section">
                        <div className="pending-invitations-header">
                          <h3 className="pending-invitations-title">
                            <span>Pending Invitations</span>
                            <span className="panel-count-pill">
                              {selectedClass.invitations.length}
                            </span>
                          </h3>
                        </div>
                        <div className="table-wrap">
                          <table className="scores-table">
                            <thead>
                              <tr>
                                <th scope="col">Student</th>
                                <th scope="col">ID / Email</th>
                                <th scope="col">Status</th>
                                {canCancelInvitation && <th scope="col">Action</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {selectedClass.invitations.map((inv) => {
                                const contactLabel =
                                  [inv.schoolId, inv.email]
                                    .filter(Boolean)
                                    .join(' · ') || '—';
                                return (
                                  <tr key={inv.id}>
                                    <td className="scores-student-name">
                                      {inv.name}
                                    </td>
                                    <td className="invitation-contact">
                                      {contactLabel}
                                    </td>
                                    <td>
                                      <span className="status-pill status-pill--pending">
                                        Pending
                                      </span>
                                    </td>
                                    {canCancelInvitation && (
                                      <td>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-xs"
                                          onClick={() =>
                                            handleCancelInvitation(
                                              selectedClass.id,
                                              inv.id
                                            )
                                          }
                                        >
                                          Cancel
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {activeView === 'activity-detail' && selectedSchedule && (
          <ActivityDetailView
            schedule={selectedSchedule}
            classroom={selectedScheduleClass}
            enableDemoControls={enableDemoControls}
            canAddStudent={canAddStudent}
            onBack={() =>
              setActiveView(
                previousView === 'activity-detail' ? 'schedules' : previousView
              )
            }
            onOpenClassroom={handleSelectClass}
            onToggleLock={handleToggleScheduleLock}
            onEditSchedule={handleOpenEditSchedule}
            onUpdateStudentScore={handleUpdateStudentScore}
            onSimulateSubmission={handleSimulateSubmission}
            onAddStudent={(classId) => handleAdjustStudents(classId, 1)}
          />
        )}
      </main>

      <ScheduleActivityModal
        isOpen={scheduleModalOpen}
        onClose={() => {
          setScheduleModalOpen(false);
          setEditingSchedule(null);
        }}
        classes={classes}
        defaultClassId={scheduleDefaultClassId}
        editingSchedule={editingSchedule}
        onSaveSchedule={handleSaveSchedule}
      />

      <ConfirmDeleteModal
        schedule={deletingSchedule}
        onClose={() => setDeletingSchedule(null)}
        onConfirm={handleDeleteSchedule}
      />

      <NewClassroomModal
        isOpen={newClassModalOpen}
        onClose={() => setNewClassModalOpen(false)}
        onAddClassroom={handleAddClassroom}
        nextIndex={classes.length + 1}
      />

      <InviteStudentModal
        isOpen={Boolean(inviteClassroom)}
        onClose={() => setInviteClassId(null)}
        classroom={inviteClassroom}
        onInviteStudent={handleInviteStudent}
      />
    </div>
  );
}

export default InstructorDashboard;
