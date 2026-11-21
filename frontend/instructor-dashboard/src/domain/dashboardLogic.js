/**
 * @typedef {Object} Student
 * @property {string} id
 * @property {string} name
 * @property {string} [schoolId]
 * @property {string} [email]
 */

/**
 * @typedef {Object} ClassroomInvitation
 * @property {string} id
 * @property {string} studentId
 * @property {string} name
 * @property {string} [schoolId]
 * @property {string} [email]
 * @property {'pending'|'accepted'|'declined'} status
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} Classroom
 * @property {string} id
 * @property {string} name
 * @property {string} [displayName]
 * @property {string} [joinCode]
 * @property {Student[]} [students]
 * @property {ClassroomInvitation[]} [invitations]
 * @property {number} [totalStudents]
 * @property {number|null} [capacity]
 * @property {number} [submitted]
 * @property {number} [atRisk]
 * @property {string} [nextActivity]
 * @property {'none'|'scheduled'|'active'|'closed'|'finished'} [activityStatus]
 * @property {string|null} [activeScheduleId]
 * @property {string} [metricType]
 * @property {string} [avgGrade]
 */

/**
 * @typedef {Object} ActivitySchedule
 * @property {string} id
 * @property {string} classId
 * @property {string} [className]
 * @property {string} activityName
 * @property {string} dateValue - YYYY-MM-DD
 * @property {string} [timeValue] - HH:mm
 * @property {string} [dueDateValue] - YYYY-MM-DD
 * @property {string} [dueTimeValue] - HH:mm
 * @property {string} [day]
 * @property {string} [dateNum]
 * @property {string} [dueDateLabel]
 * @property {boolean} [isLocked]
 * @property {boolean} [manualOverride]
 * @property {'scheduled'|'active'|'closed'|'finished'} [status]
 * @property {string} [scheduledAt]
 * @property {string} [dueAt]
 * @property {Record<string, number>} [scores]
 * @property {number} [submitted]
 * @property {string} [activityAvg]
 */

/**
 * @typedef {Object} DashboardDataAdapter
 * @property {() => Promise<{classes: Classroom[], schedules: ActivitySchedule[], instructorName?: string}>} [loadInitialData]
 * @property {(payload: Omit<Classroom, 'id'>) => Promise<Classroom>} [createClassroom]
 * @property {(payload: ActivitySchedule | Omit<ActivitySchedule, 'id'>) => Promise<ActivitySchedule>} [saveSchedule]
 * @property {(scheduleId: string) => Promise<void>} [deleteSchedule]
 * @property {(scheduleId: string, nextLocked: boolean) => Promise<Partial<ActivitySchedule>|void>} [toggleScheduleLock]
 * @property {(scheduleId: string, studentId: string, score: number|null) => Promise<number|null|void>} [updateStudentScore]
 * @property {(name: string) => Promise<string|void>} [updateInstructorName]
 * @property {(classroom: Classroom, delta: number) => Promise<Partial<Classroom>|void>} [adjustStudents]
 * @property {(classroom: Classroom) => Promise<Partial<Classroom>|void>} [addStudent]
 * @property {(classroom: Classroom, identifier: string) => Promise<Partial<Classroom>|void>} [inviteStudent]
 * @property {(classroom: Classroom, invitationId: string) => Promise<Partial<Classroom>|void>} [cancelInvitation]
 * @property {(classroom: Classroom, studentId: string) => Promise<Partial<Classroom>|void>} [removeStudent]
 * @property {(schedule: ActivitySchedule, classroom: Classroom) => Promise<{studentId: string, score: number}|null>} [simulateSubmission]
 * @property {(schedule: ActivitySchedule, classroom: Classroom) => Promise<{studentId: string}|null>} [decrementSubmission]
 */

const JOIN_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateJoinCode() {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    const idx = Math.floor(Math.random() * JOIN_CODE_CHARS.length);
    code += JOIN_CODE_CHARS[idx];
  }
  return `APC-${code}`;
}

export function getTodayDateString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNowDateTimeString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getTimeOfDayGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function getLockedStatusLabel(status) {
  if (status === 'closed') return 'Closed';
  if (status === 'finished') return 'Finished';
  return 'Scheduled';
}

export function formatScheduleDateBadge(dateValue) {
  if (!dateValue) return { day: '', dateNum: '' };
  const dateObj = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return { day: '', dateNum: '' };
  const day = new Intl.DateTimeFormat('en-US', { month: 'short' })
    .format(dateObj)
    .toUpperCase();
  const dateNum = String(dateObj.getDate());
  return { day, dateNum };
}

export function formatDueDateLabel(dueDateValue, dueTimeValue = '') {
  if (!dueDateValue) return '';
  const dateObj = new Date(`${dueDateValue}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return '';
  const shortDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
  return dueTimeValue ? `${shortDate}, ${dueTimeValue}` : shortDate;
}

/** @param {Classroom} cls */
export function normalizeClassroom(cls) {
  const students = Array.isArray(cls?.students) ? cls.students : [];
  const invitations = Array.isArray(cls?.invitations) ? cls.invitations : [];
  const totalStudents =
    students.length > 0
      ? students.length
      : Math.max(0, Number(cls?.totalStudents ?? 0) || 0);
  const name = cls?.name || cls?.displayName || 'Classroom';
  const displayName = cls?.displayName || cls?.name || 'Classroom';

  return {
    ...cls,
    name,
    displayName,
    students,
    invitations,
    totalStudents,
    capacity: cls?.capacity ?? null,
    atRisk: cls?.atRisk ?? 0,
    avgGrade: cls?.avgGrade ?? '—',
    nextActivity: cls?.nextActivity || 'No Schedules',
    activityStatus: cls?.activityStatus || 'none',
    submitted: cls?.submitted ?? 0,
  };
}

/**
 * @param {ActivitySchedule} schedule
 * @param {Classroom[]} [classesList]
 */
export function normalizeSchedule(schedule, classesList = []) {
  const targetClass = classesList.find((c) => c.id === schedule.classId);
  const badge =
    schedule.day && schedule.dateNum
      ? { day: schedule.day, dateNum: schedule.dateNum }
      : formatScheduleDateBadge(schedule.dateValue);
  const dueDateLabel =
    schedule.dueDateLabel !== undefined && schedule.dueDateLabel !== ''
      ? schedule.dueDateLabel
      : formatDueDateLabel(schedule.dueDateValue, schedule.dueTimeValue);
  const className =
    schedule.className ||
    targetClass?.displayName ||
    targetClass?.name ||
    'Classroom';

  return {
    ...schedule,
    day: badge.day || schedule.day || '',
    dateNum: badge.dateNum || schedule.dateNum || '',
    dueDateLabel,
    className,
    scores: schedule.scores || {},
  };
}

export function computeActivitySubmissionStats(schedule, students = []) {
  const scores = schedule?.scores || {};
  if (students.length > 0) {
    const studentIds = new Set(students.map((s) => s.id));
    const validScores = Object.entries(scores)
      .filter(
        ([id, val]) =>
          studentIds.has(id) && typeof val === 'number' && !Number.isNaN(val)
      )
      .map(([, val]) => val);

    const activityAvg =
      validScores.length > 0
        ? `${Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)}%`
        : '—';

    return { submittedCount: validScores.length, activityAvg };
  }

  return {
    submittedCount: schedule?.submitted ?? 0,
    activityAvg: schedule?.activityAvg ?? '—',
  };
}

export function computeScheduleLifecycle(
  schedule,
  nowStr = getNowDateTimeString(),
  students = [],
  totalStudents = students.length
) {
  const scheduledAt = schedule.dateValue
    ? `${schedule.dateValue}T${schedule.timeValue || '00:00'}`
    : '';
  const dueAt = schedule.dueDateValue
    ? `${schedule.dueDateValue}T${schedule.dueTimeValue || '23:59'}`
    : '';
  const isPastDue = Boolean(dueAt && nowStr >= dueAt);
  const isBeforeStart = Boolean(scheduledAt && nowStr < scheduledAt);
  const isLocked = schedule.manualOverride
    ? Boolean(schedule.isLocked)
    : Boolean(isBeforeStart || isPastDue);

  const { submittedCount } = computeActivitySubmissionStats(schedule, students);
  const effectiveTotal =
    students.length > 0 ? students.length : Math.max(0, totalStudents);
  const isFinished = effectiveTotal > 0 && submittedCount >= effectiveTotal;

  const status = isFinished
    ? 'finished'
    : !isLocked
      ? 'active'
      : isPastDue
        ? 'closed'
        : 'scheduled';

  return { isLocked, status, scheduledAt, dueAt, submittedCount };
}

export function sortSchedulesChronologically(schedulesList) {
  return [...schedulesList].sort((a, b) =>
    (a.scheduledAt || '').localeCompare(b.scheduledAt || '')
  );
}

/**
 * Reconcile schedule statuses and submission counts against current classroom
 * rosters and wall-clock time without fabricating placeholder students.
 */
export function reconcileSchedulesWithClasses(
  schedulesList,
  classesList,
  nowStr = getNowDateTimeString()
) {
  return sortSchedulesChronologically(
    schedulesList.map((rawSchedule) => {
      const normalized = normalizeSchedule(rawSchedule, classesList);
      const targetClass = classesList.find((c) => c.id === normalized.classId);
      const students = Array.isArray(targetClass?.students)
        ? targetClass.students
        : [];
      const totalStudents =
        students.length > 0
          ? students.length
          : Math.max(0, Number(targetClass?.totalStudents ?? 0) || 0);
      const lifecycle = computeScheduleLifecycle(
        normalized,
        nowStr,
        students,
        totalStudents
      );

      return {
        ...normalized,
        scheduledAt: lifecycle.scheduledAt,
        dueAt: lifecycle.dueAt,
        isLocked: lifecycle.isLocked,
        status: lifecycle.status,
        submitted: lifecycle.submittedCount,
      };
    })
  );
}

/**
 * Roll up primary activity status, submissions, average grade, and at-risk
 * student count for each classroom. Preserves host-supplied summary metrics when
 * a classroom has `totalStudents > 0` without loaded student rows.
 */
export function syncClassesNextActivity(classesList, nextSchedules) {
  const sorted = sortSchedulesChronologically(nextSchedules);
  return classesList.map((rawCls) => {
    const cls = normalizeClassroom(rawCls);
    const students = cls.students;
    const classScheds = sorted.filter((s) => s.classId === cls.id);
    const primary =
      classScheds.find((s) => s.status === 'active' || s.status === 'scheduled') ||
      classScheds[classScheds.length - 1] ||
      null;
    const activityStatus = primary ? primary.status : 'none';
    const submitted = primary
      ? computeActivitySubmissionStats(primary, students).submittedCount
      : 0;

    let avgGrade = cls.totalStudents > 0 ? cls.avgGrade : '—';
    let atRisk = cls.totalStudents > 0 ? cls.atRisk : 0;

    if (students.length > 0) {
      let totalScoreSum = 0;
      let totalScoreCount = 0;
      for (const sched of classScheds) {
        const scores = sched.scores || {};
        for (const stu of students) {
          const val = scores[stu.id];
          if (typeof val === 'number' && !Number.isNaN(val)) {
            totalScoreSum += val;
            totalScoreCount += 1;
          }
        }
      }
      avgGrade =
        totalScoreCount > 0
          ? `${Math.round(totalScoreSum / totalScoreCount)}%`
          : '—';

      const closedScheds = classScheds.filter((s) => s.status === 'closed');
      atRisk = students.filter((stu) => {
        const stuScores = classScheds
          .map((s) => s.scores?.[stu.id])
          .filter((v) => typeof v === 'number' && !Number.isNaN(v));
        const lowAvg =
          stuScores.length > 0 &&
          stuScores.reduce((a, b) => a + b, 0) / stuScores.length < 75;
        const missedClosed = closedScheds.some((s) => {
          const val = s.scores?.[stu.id];
          return typeof val !== 'number' || Number.isNaN(val);
        });
        return lowAvg || missedClosed;
      }).length;
    }

    const nextActivity = !primary
      ? 'No Schedules'
      : primary.status === 'finished'
        ? 'All caught up'
        : primary.activityName;

    return {
      ...cls,
      students,
      nextActivity,
      activityStatus,
      activeScheduleId: primary ? primary.id : null,
      submitted,
      avgGrade,
      atRisk,
    };
  });
}

export function computeStudentSummaries(students = [], classSchedules = []) {
  const closedScheds = classSchedules.filter((s) => s.status === 'closed');
  return students.map((student) => {
    const stuScores = classSchedules
      .map((s) => s.scores?.[student.id])
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    const overallAvg =
      stuScores.length > 0
        ? `${Math.round(
            stuScores.reduce((a, b) => a + b, 0) / stuScores.length
          )}%`
        : '—';
    const lowAvg =
      stuScores.length > 0 &&
      stuScores.reduce((a, b) => a + b, 0) / stuScores.length < 75;
    const missedClosed = closedScheds.some((s) => {
      const val = s.scores?.[student.id];
      return typeof val !== 'number' || Number.isNaN(val);
    });
    const isAtRisk = lowAvg || missedClosed;

    return {
      student,
      submittedCount: stuScores.length,
      totalActivities: classSchedules.length,
      overallAvg,
      isAtRisk,
      status: isAtRisk
        ? 'at-risk'
        : stuScores.length > 0
          ? 'on-track'
          : 'enrolled',
    };
  });
}
