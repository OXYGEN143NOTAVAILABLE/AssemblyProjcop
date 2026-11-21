export const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export const ACTIVITY_STATUSES = Object.freeze([
  'notStarted',
  'inProgress',
  'submitted',
  'released',
]);

export function normalizeJoinCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function validateJoinCode(raw) {
  const code = normalizeJoinCode(raw);
  if (!code) {
    return { valid: false, code: '', error: 'Enter a class join code provided by your instructor.' };
  }
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    return { valid: false, code, error: 'Join codes use 4–20 letters, numbers, or hyphens (for example, LNU-IT204B).' };
  }
  return { valid: true, code, error: '' };
}

export function canStudentStartActivity(activity) {
  if (!activity) return false;
  const status = activity.status || 'notStarted';
  if (status === 'submitted' || status === 'released') return false;
  const allowed = Number(activity.attemptsAllowed ?? 1);
  const used = Number(activity.attemptsUsed ?? 0);
  return used < allowed;
}

/**
 * Enforces FR-15 & SEC-08: Evaluation results, compatibility verdicts,
 * scores, and instructor feedback MUST remain strictly withheld from
 * students until the instructor explicitly sets status = 'released'.
 */
export function sanitizeActivityForStudent(scenarioPublic, record, classInfo, instructorName) {
  const status = ACTIVITY_STATUSES.includes(record?.status) ? record.status : 'notStarted';
  const isReleased = status === 'released';
  const attemptsAllowed = Number(record?.attempts_allowed ?? 1);
  const attemptsUsed = Number(record?.attempts_used ?? (status === 'submitted' || status === 'released' ? 1 : 0));

  let parsedIssues = [];
  if (isReleased) {
    if (Array.isArray(record?.issues)) {
      parsedIssues = record.issues;
    } else if (typeof record?.issues_json === 'string') {
      try {
        const parsed = JSON.parse(record.issues_json);
        if (Array.isArray(parsed)) parsedIssues = parsed;
      } catch {}
    }
  }

  return {
    ...scenarioPublic,
    classId: classInfo?.class_id ?? record?.class_id ?? null,
    className: classInfo ? `${classInfo.course_code} · ${classInfo.section}` : 'BSIT Hardware Lab',
    classTitle: classInfo?.class_name || 'Computer Systems & Hardware Assembly',
    instructor: scenarioPublic.instructor || { displayName: instructorName || 'Instructor' },
    dueDate: record?.due_date || null,
    status,
    attemptsAllowed,
    attemptsUsed,
    canStart: canStudentStartActivity({ status, attemptsAllowed, attemptsUsed }),
    lastSavedAt: status === 'inProgress' ? (record?.last_saved_at || null) : null,
    submittedAt: status === 'submitted' || status === 'released' ? (record?.submitted_at || null) : null,
    // FR-15: Strictly withheld unless instructor has released the evaluation
    releasedResult: isReleased
      ? {
          compatibilityVerdict: record?.compatibility_verdict || 'Compatible',
          activityScore: record?.final_score != null ? Number(record.final_score) : null,
          issues: parsedIssues,
          feedback: record?.instructor_feedback || '',
          instructorName: record?.reviewed_by_name || scenarioPublic.instructor?.displayName || instructorName || 'Instructor',
          releasedAt: record?.released_at || null,
          immutable: true,
        }
      : null,
    completion: isReleased && record?.final_score != null
      ? { score: Number(record.final_score), completedAt: record?.released_at || record?.submitted_at || null }
      : null,
  };
}

export function computeStudentDashboardStats(activities = []) {
  const list = Array.isArray(activities) ? activities : [];
  let notStarted = 0;
  let inProgress = 0;
  let awaitingReview = 0;
  let released = 0;

  for (const act of list) {
    const s = act?.status || 'notStarted';
    if (s === 'inProgress') inProgress += 1;
    else if (s === 'submitted') awaitingReview += 1;
    else if (s === 'released') released += 1;
    else notStarted += 1;
  }

  const nextUp =
    list.find((a) => a.status === 'inProgress') ||
    list.find((a) => a.status === 'notStarted') ||
    null;

  return {
    assigned: list.length,
    notStarted,
    inProgress,
    awaitingReview,
    released,
    nextUpId: nextUp ? nextUp.id : null,
  };
}

export function isSessionExpired(lastActivityMs, nowMs = Date.now(), timeoutMs = SESSION_INACTIVITY_TIMEOUT_MS) {
  if (!Number.isFinite(lastActivityMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastActivityMs >= timeoutMs;
}
