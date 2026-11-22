import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateJoinCode,
  canStudentStartActivity,
  sanitizeActivityForStudent,
  computeStudentDashboardStats,
  isSessionExpired,
  SESSION_INACTIVITY_TIMEOUT_MS,
} from './studentLogic.mjs';
import { AppDatabase } from './db.mjs';

const sampleScenario = {
  id: 3,
  title: 'Classroom Workstation Assembly',
  description: 'Assemble a compatible workstation.',
  activityType: 'PC build',
  tier: 'Intermediate',
  budget: 900,
  timeLimitMinutes: 25,
  objectives: ['Match CPU and motherboard socket'],
  instructor: { id: 2, displayName: 'Prof. Santos (BSIT)' },
  createdAt: '2026-11-18T08:00:00.000Z',
};

const sampleClass = {
  class_id: 1,
  course_code: 'IT 204',
  class_name: 'Computer Systems & Hardware Assembly',
  section: 'BSIT-2A',
};

test('FR-15: sanitizeActivityForStudent strictly withholds scores & verdict while submitted (awaiting review)', () => {
  const submittedRecord = {
    status: 'submitted',
    attempts_allowed: 1,
    attempts_used: 1,
    submitted_at: '2026-11-19T10:00:00.000Z',
    compatibility_verdict: 'Compatible',
    proposed_score: 88,
    final_score: 88,
    issues_json: JSON.stringify(['Minor cable warning']),
    instructor_feedback: 'Draft note not yet released',
    reviewed_by_name: 'Prof. Santos (BSIT)',
    released_at: null,
  };

  const result = sanitizeActivityForStudent(sampleScenario, submittedRecord, sampleClass, 'Prof. Santos (BSIT)');
  assert.equal(result.status, 'submitted');
  assert.equal(result.releasedResult, null);
  assert.equal(result.completion, null);
  assert.equal(result.canStart, false);
  assert.equal(result.attemptsUsed, 1);
  assert.equal(result.submittedAt, '2026-11-19T10:00:00.000Z');
});

test('FR-06 & SEC-08: sanitizeActivityForStudent exposes official immutable result ONLY after release', () => {
  const releasedRecord = {
    status: 'released',
    attempts_allowed: 1,
    attempts_used: 1,
    submitted_at: '2026-11-15T09:30:00.000Z',
    compatibility_verdict: 'Compatible',
    final_score: 92,
    issues_json: JSON.stringify([]),
    instructor_feedback: 'Well-balanced build with accurate LGA1700 pairing.',
    reviewed_by_name: 'Prof. Santos (BSIT)',
    released_at: '2026-11-17T14:00:00.000Z',
  };

  const result = sanitizeActivityForStudent(sampleScenario, releasedRecord, sampleClass, 'Prof. Santos (BSIT)');
  assert.equal(result.status, 'released');
  assert.equal(result.canStart, false);
  assert.ok(result.releasedResult);
  assert.equal(result.releasedResult.compatibilityVerdict, 'Compatible');
  assert.equal(result.releasedResult.activityScore, 92);
  assert.equal(result.releasedResult.immutable, true);
  assert.equal(result.releasedResult.feedback, 'Well-balanced build with accurate LGA1700 pairing.');
});

test('FR-05: canStudentStartActivity enforces single-attempt rule', () => {
  assert.equal(canStudentStartActivity({ status: 'notStarted', attemptsAllowed: 1, attemptsUsed: 0 }), true);
  assert.equal(canStudentStartActivity({ status: 'inProgress', attemptsAllowed: 1, attemptsUsed: 0 }), true);
  assert.equal(canStudentStartActivity({ status: 'submitted', attemptsAllowed: 1, attemptsUsed: 1 }), false);
  assert.equal(canStudentStartActivity({ status: 'released', attemptsAllowed: 1, attemptsUsed: 1 }), false);
  assert.equal(canStudentStartActivity({ status: 'notStarted', attemptsAllowed: 1, attemptsUsed: 1 }), false);
});

test('SEC-06: validateJoinCode normalizes valid join codes and rejects malformed inputs', () => {
  assert.deepEqual(validateJoinCode(' lnu-it204b '), { valid: true, code: 'LNU-IT204B', error: '' });
  assert.equal(validateJoinCode('').valid, false);
  assert.equal(validateJoinCode('ab').valid, false);
  assert.equal(validateJoinCode('DROP TABLE;').valid, false);
});

test('computeStudentDashboardStats counts all four lifecycle states and prioritizes inProgress for nextUp', () => {
  const stats = computeStudentDashboardStats([
    { id: 2, status: 'notStarted' },
    { id: 1, status: 'inProgress' },
    { id: 3, status: 'submitted' },
    { id: 4, status: 'released' },
  ]);
  assert.deepEqual(stats, {
    assigned: 4,
    notStarted: 1,
    inProgress: 1,
    awaitingReview: 1,
    released: 1,
    nextUpId: 1,
  });
});

test('SEC-07: isSessionExpired enforces 30-minute inactivity timeout', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(isSessionExpired(t0, t0 + SESSION_INACTIVITY_TIMEOUT_MS - 1000), false);
  assert.equal(isSessionExpired(t0, t0 + SESSION_INACTIVITY_TIMEOUT_MS), true);
});

test('AppDatabase seeds classroom classes, 4 lifecycle activity states, enrollment join & privacy audit log', () => {
  const db = new AppDatabase(':memory:');
  try {
    const store = db.loadStore();
    assert.ok(store.classes.length >= 2, 'Expected seeded classes');
    assert.ok(store.activity_records.length >= 4, 'Expected seeded activity records covering all 4 states');
    const statuses = new Set(store.activity_records.map((r) => r.status));
    assert.ok(statuses.has('notStarted'));
    assert.ok(statuses.has('inProgress'));
    assert.ok(statuses.has('submitted'));
    assert.ok(statuses.has('released'));

    // Join second class (pending instructor approval)
    const labClass = store.classes.find((c) => c.join_code === 'LNU-IT204B');
    assert.ok(labClass);
    const enrolled = db.upsertEnrollment({
      class_id: labClass.class_id,
      student_id: 1,
      status: 'pending',
      requested_at: '2026-11-20T10:00:00.000Z',
      decided_at: null,
    });
    assert.equal(enrolled.status, 'pending');

    // Audit log & RA 10173 privacy request persistence
    const log = db.insertAuditLog({
      actor_role: 'student',
      actor_id: 1,
      action: 'join_class_requested',
      target_type: 'class',
      target_id: String(labClass.class_id),
      details: { joinCode: 'LNU-IT204B' },
      created_at: '2026-11-20T10:00:00.000Z',
    });
    assert.ok(log.log_id > 0);

    const priv = db.insertPrivacyRequest({
      student_id: 1,
      request_type: 'erasure',
      reason: 'Graduating student data request',
      status: 'recorded',
      created_at: '2026-11-20T10:05:00.000Z',
    });
    assert.ok(priv.request_id > 0);
  } finally {
    db.close();
  }
});
