import { useState } from 'react';
import { ModalDialog } from './ModalDialog';
import {
  computeScheduleLifecycle,
  getNowDateTimeString,
  getTodayDateString,
} from '../domain/dashboardLogic';

const WORKSTATION_ACTIVITY_GROUPS = [
  {
    group: '3D Workstation Troubleshooting Labs',
    options: [
      {
        value: 'Fault Lab 1: No-POST & Inverted Airflow Rig',
        label: 'Fault Lab 1: No-POST & Inverted Airflow Rig',
      },
      {
        value: 'Fault Lab 2: Memory Conflict & Unplugged Rails',
        label: 'Fault Lab 2: Memory Conflict & Unplugged Rails',
      },
    ],
  },
  {
    group: '3D Workstation Build Scenarios',
    options: [
      {
        value: 'AM5 DDR5 Workstation Build',
        label: 'AM5 DDR5 Workstation Build',
      },
      {
        value: 'Entry LGA1700 Lab PC',
        label: 'Entry LGA1700 Lab PC',
      },
    ],
  },
];

const ALL_PRESET_VALUES = new Set(
  WORKSTATION_ACTIVITY_GROUPS.flatMap((g) => g.options.map((o) => o.value))
);

function formatShortDate(ymd) {
  if (!ymd) return '';
  const dateObj = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

function addDaysToYmd(ymd, days) {
  const base = ymd ? new Date(`${ymd}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return getTodayDateString();
  base.setDate(base.getDate() + days);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeHHMM() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function ScheduleActivityForm({
  classes,
  defaultClassId,
  editingSchedule,
  onSaveSchedule,
  onClose,
}) {
  const [classId, setClassId] = useState(
    editingSchedule?.classId || defaultClassId || classes[0]?.id || ''
  );
  const [activityName, setActivityName] = useState(
    editingSchedule?.activityName ||
      WORKSTATION_ACTIVITY_GROUPS[0].options[0].value
  );
  const [dateValue, setDateValue] = useState(
    editingSchedule?.dateValue || getTodayDateString()
  );
  const [timeValue, setTimeValue] = useState(
    editingSchedule?.timeValue || '08:00'
  );
  const [dueDateValue, setDueDateValue] = useState(
    editingSchedule?.dueDateValue || getTodayDateString()
  );
  const [dueTimeValue, setDueTimeValue] = useState(
    editingSchedule?.dueTimeValue || '23:59'
  );
  const [manualLockTouched, setManualLockTouched] = useState(
    Boolean(editingSchedule?.manualOverride)
  );
  const [isLocked, setIsLocked] = useState(() => {
    if (editingSchedule) {
      return Boolean(editingSchedule.isLocked);
    }
    return computeScheduleLifecycle({
      dateValue: getTodayDateString(),
      timeValue: '08:00',
      dueDateValue: getTodayDateString(),
      dueTimeValue: '23:59',
      manualOverride: false,
    }).isLocked;
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAutoLock = (nextDate, nextTime, nextDueDate, nextDueTime) => {
    if (!manualLockTouched) {
      const res = computeScheduleLifecycle({
        dateValue: nextDate,
        timeValue: nextTime,
        dueDateValue: nextDueDate,
        dueTimeValue: nextDueTime,
        manualOverride: false,
      });
      setIsLocked(res.isLocked);
    }
  };

  const applyDatesAndSync = (nextDate, nextTime, nextDueDate, nextDueTime) => {
    setDateValue(nextDate);
    setTimeValue(nextTime);
    setDueDateValue(nextDueDate);
    setDueTimeValue(nextDueTime);
    setErrorMsg('');
    updateAutoLock(nextDate, nextTime, nextDueDate, nextDueTime);
  };

  const nowStr = getNowDateTimeString();
  const previewLifecycle = computeScheduleLifecycle(
    {
      dateValue,
      timeValue,
      dueDateValue,
      dueTimeValue,
      isLocked,
      manualOverride: false,
    },
    nowStr
  );
  const isBeforeStart = Boolean(
    previewLifecycle.scheduledAt && nowStr < previewLifecycle.scheduledAt
  );
  const isDueDateMet = Boolean(
    previewLifecycle.dueAt && nowStr >= previewLifecycle.dueAt
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!activityName.trim() || !classId || isSubmitting) return;

    if (dateValue && dueDateValue) {
      const scheduledAtCheck = `${dateValue}T${timeValue || '00:00'}`;
      const dueAtCheck = `${dueDateValue}T${dueTimeValue || '23:59'}`;
      if (dueAtCheck <= scheduledAtCheck) {
        setErrorMsg(
          'Due date and time must be after the scheduled start date and time.'
        );
        return;
      }
    }

    const dateObj = new Date(`${dateValue}T12:00:00`);
    const day = Number.isNaN(dateObj.getTime())
      ? ''
      : new Intl.DateTimeFormat('en-US', { month: 'short' })
          .format(dateObj)
          .toUpperCase();
    const dateNum = Number.isNaN(dateObj.getTime())
      ? ''
      : String(dateObj.getDate());

    const dueLabelDate = formatShortDate(dueDateValue);
    const dueDateLabel = dueLabelDate
      ? `${dueLabelDate}, ${dueTimeValue}`
      : '';

    const lifecycle = computeScheduleLifecycle({
      dateValue,
      timeValue,
      dueDateValue,
      dueTimeValue,
      isLocked,
      manualOverride: manualLockTouched,
    });

    const targetClass = classes.find((c) => c.id === classId);
    setIsSubmitting(true);
    try {
      await onSaveSchedule({
        id: editingSchedule?.id,
        classId,
        className: targetClass?.displayName || targetClass?.name || 'Classroom',
        activityName: activityName.trim(),
        day,
        dateNum,
        dateValue,
        timeValue,
        dueDateValue,
        dueTimeValue,
        dueDateLabel,
        isLocked: lifecycle.isLocked,
        status: lifecycle.status,
        scheduledAt: lifecycle.scheduledAt,
        dueAt: lifecycle.dueAt,
        manualOverride: manualLockTouched,
        submitted: editingSchedule?.submitted ?? 0,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to save scheduled activity.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        <div className="form-field">
          <label className="form-label" htmlFor="schedule-class-select">
            Classroom
          </label>
          <select
            id="schedule-class-select"
            className="form-select"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={classes.length === 0}
          >
            {classes.length === 0 ? (
              <option value="">No classrooms available</option>
            ) : (
              classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.displayName && cls.displayName !== cls.name
                    ? `${cls.name} (${cls.displayName})`
                    : cls.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="schedule-activity-name">
            Activity Name
          </label>
          <select
            id="schedule-activity-name"
            className="form-select"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            required
          >
            {editingSchedule?.activityName &&
              !ALL_PRESET_VALUES.has(editingSchedule.activityName) && (
                <option value={editingSchedule.activityName}>
                  {editingSchedule.activityName}
                </option>
              )}
            {WORKSTATION_ACTIVITY_GROUPS.map((grp) => (
              <optgroup key={grp.group} label={grp.group}>
                {grp.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="date-presets-row" role="group" aria-label="Quick schedule presets">
          <button
            type="button"
            className="btn-secondary btn-xs"
            onClick={() => {
              const today = getTodayDateString();
              const nowTime = getCurrentTimeHHMM();
              const nextDueDate =
                !dueDateValue || dueDateValue < today ? today : dueDateValue;
              const nextDueTime =
                nextDueDate === today && dueTimeValue <= nowTime
                  ? '23:59'
                  : dueTimeValue;
              applyDatesAndSync(today, nowTime, nextDueDate, nextDueTime);
            }}
          >
            Start Now
          </button>
          <button
            type="button"
            className="btn-secondary btn-xs"
            onClick={() => {
              const tomorrow = addDaysToYmd(getTodayDateString(), 1);
              const nextDueDate =
                !dueDateValue || dueDateValue < tomorrow ? tomorrow : dueDateValue;
              const nextDueTime =
                nextDueDate === tomorrow && dueTimeValue <= '08:00'
                  ? '23:59'
                  : dueTimeValue;
              applyDatesAndSync(tomorrow, '08:00', nextDueDate, nextDueTime);
            }}
          >
            Start Tomorrow
          </button>
          <button
            type="button"
            className="btn-secondary btn-xs"
            onClick={() => {
              const tomorrow = addDaysToYmd(getTodayDateString(), 1);
              applyDatesAndSync(dateValue, timeValue, tomorrow, '23:59');
            }}
          >
            Due Tomorrow
          </button>
          <button
            type="button"
            className="btn-secondary btn-xs"
            onClick={() => {
              const nextWeek = addDaysToYmd(
                dateValue || getTodayDateString(),
                7
              );
              applyDatesAndSync(dateValue, timeValue, nextWeek, '23:59');
            }}
          >
            Due +7 Days
          </button>
        </div>

        <div className="form-row-2col">
          <div className="form-field">
            <label className="form-label" htmlFor="schedule-date-input">
              Scheduled Date
            </label>
            <input
              id="schedule-date-input"
              className="form-input"
              type="date"
              value={dateValue}
              onChange={(e) => {
                const nextDate = e.target.value;
                const nextDueDate =
                  nextDate && (!dueDateValue || nextDate > dueDateValue)
                    ? nextDate
                    : dueDateValue;
                applyDatesAndSync(nextDate, timeValue, nextDueDate, dueTimeValue);
              }}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="schedule-time-input">
              Scheduled Time
            </label>
            <input
              id="schedule-time-input"
              className="form-input"
              type="time"
              value={timeValue}
              onChange={(e) => {
                const nextTime = e.target.value;
                setTimeValue(nextTime);
                setErrorMsg('');
                updateAutoLock(dateValue, nextTime, dueDateValue, dueTimeValue);
              }}
              required
            />
          </div>
        </div>

        <div className="form-row-2col">
          <div className="form-field">
            <label className="form-label" htmlFor="schedule-due-date-input">
              Due Date
            </label>
            <input
              id="schedule-due-date-input"
              className="form-input"
              type="date"
              value={dueDateValue}
              onChange={(e) => {
                const nextDueDate = e.target.value;
                setDueDateValue(nextDueDate);
                setErrorMsg('');
                updateAutoLock(dateValue, timeValue, nextDueDate, dueTimeValue);
              }}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="schedule-due-time-input">
              Due Time
            </label>
            <input
              id="schedule-due-time-input"
              className="form-input"
              type="time"
              value={dueTimeValue}
              onChange={(e) => {
                const nextDueTime = e.target.value;
                setDueTimeValue(nextDueTime);
                setErrorMsg('');
                updateAutoLock(dateValue, timeValue, dueDateValue, nextDueTime);
              }}
              required
            />
          </div>
        </div>

        {errorMsg && (
          <p className="form-error" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="form-field">
          <div className="form-checkbox-row">
            <input
              id="schedule-lock-checkbox"
              type="checkbox"
              checked={isLocked}
              onChange={(e) => {
                setManualLockTouched(true);
                setIsLocked(e.target.checked);
              }}
            />
            <label className="form-label" htmlFor="schedule-lock-checkbox">
              Lock activity (prevent submissions until unlocked)
            </label>
          </div>
          {(isBeforeStart || isDueDateMet) && (
            <span className="form-hint">
              {isDueDateMet
                ? 'Due date & time met — activity automatically closes unless unlocked by the instructor.'
                : 'Scheduled for the future — activity stays locked until its start date & time.'}
            </span>
          )}
        </div>
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
        <button
          type="submit"
          className="btn-primary"
          disabled={classes.length === 0 || isSubmitting}
        >
          {isSubmitting
            ? 'Saving...'
            : editingSchedule
              ? 'Save Changes'
              : 'Schedule'}
        </button>
      </div>
    </form>
  );
}

export function ScheduleActivityModal({
  isOpen,
  onClose,
  classes,
  defaultClassId,
  editingSchedule,
  onSaveSchedule,
}) {
  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title={editingSchedule ? 'Edit Activity' : 'Schedule Activity'}
    >
      {isOpen && (
        <ScheduleActivityForm
          key={editingSchedule?.id || defaultClassId || 'new'}
          classes={classes}
          defaultClassId={defaultClassId}
          editingSchedule={editingSchedule}
          onSaveSchedule={onSaveSchedule}
          onClose={onClose}
        />
      )}
    </ModalDialog>
  );
}
