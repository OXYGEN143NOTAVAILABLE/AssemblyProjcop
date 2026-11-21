export const STUDENT_NAMES = [
  'Alex Rivera',
  'Maya Lin',
  'Jordan Patel',
  'Sofia Cruz',
  'Ethan Brooks',
  'Chloe Tan',
  'Liam O’Connor',
  'Hannah Kim',
  'Noah Santos',
  'Aria Chen',
  'Lucas Morales',
  'Zoe Navarro',
  'Mason Garcia',
  'Nadia Reyes',
  'Caleb Nguyen',
  'Elena Ramos',
  'Owen Bautista',
  'Isla Mendoza',
  'Julian Lim',
  'Tessa Aquino',
  'Gabriel Diaz',
  'Kira Villanueva',
  'Dylan Flores',
  'Mila Castillo',
  'Leo Soriano',
  'Ruby Salazar',
  'Isaac Mercado',
  'Clara Vergara',
  'Adrian Pascual',
  'Nina Alcantara',
];

export const INITIAL_CLASSES = [];

export const INITIAL_SCHEDULES = [];

export function parseStudentSeq(id) {
  const match = /^stu-(\d+)$/.exec(String(id || ''));
  return match ? Number(match[1]) : 0;
}

export function buildStudentRoster(count, existingStudents = [], startSeq = 1) {
  const safeCount = Math.max(0, count);
  const roster = existingStudents.slice(0, safeCount);
  if (roster.length >= safeCount) {
    return roster;
  }

  const usedIds = new Set(roster.map((s) => s.id));
  const usedNames = new Set(roster.map((s) => s.name));
  const maxExistingSeq = roster.reduce(
    (max, stu) => Math.max(max, parseStudentSeq(stu.id)),
    0
  );
  let seq = Math.max(1, startSeq, maxExistingSeq + 1);

  while (roster.length < safeCount) {
    while (usedIds.has(`stu-${seq}`)) {
      seq += 1;
    }
    const id = `stu-${seq}`;
    const candidateName = seq <= STUDENT_NAMES.length ? STUDENT_NAMES[seq - 1] : null;
    const name =
      candidateName && !usedNames.has(candidateName)
        ? candidateName
        : STUDENT_NAMES.find((n) => !usedNames.has(n)) || `Student ${seq}`;
    roster.push({ id, name });
    usedIds.add(id);
    usedNames.add(name);
    seq += 1;
  }

  return roster;
}

/**
 * In-memory demo adapter used by the standalone prototype.
 * Host applications replace this by passing their own `adapter` prop or
 * controlled props to `<InstructorDashboard />`.
 *
 * @returns {import('../domain/dashboardLogic').DashboardDataAdapter}
 */
export function createInMemoryDashboardAdapter() {
  let classSeq = 0;
  let scheduleSeq = 0;

  return {
    async createClassroom(payload) {
      classSeq += 1;
      return {
        id: `class-${classSeq}`,
        students: [],
        nextStudentSeq: 1,
        ...payload,
      };
    },

    async saveSchedule(payload) {
      if (payload.id) {
        return { ...payload };
      }
      scheduleSeq += 1;
      return {
        scores: {},
        ...payload,
        id: `sched-${scheduleSeq}`,
      };
    },

    async deleteSchedule() {},

    async toggleScheduleLock(_scheduleId, nextLocked) {
      return {
        isLocked: nextLocked,
        manualOverride: true,
      };
    },

    async updateStudentScore(_scheduleId, _studentId, score) {
      if (score === null || score === undefined || score === '') {
        return null;
      }
      const parsed = Number(score);
      if (Number.isNaN(parsed)) return null;
      return Math.round(Math.max(0, Math.min(100, parsed)));
    },

    async updateInstructorName(name) {
      return name;
    },

    async adjustStudents(classroom, delta) {
      const existing = classroom.students || [];
      const maxExistingSeq = existing.reduce(
        (max, stu) => Math.max(max, parseStudentSeq(stu.id)),
        0
      );
      const startSeq = Math.max(
        classroom.nextStudentSeq ?? 1,
        maxExistingSeq + 1
      );
      const maxStudents = classroom.capacity ?? 500;
      const currentTotal =
        existing.length > 0 ? existing.length : classroom.totalStudents ?? 0;
      const nextTotalStudents = Math.max(
        0,
        Math.min(maxStudents, currentTotal + delta)
      );
      const nextRoster = buildStudentRoster(
        nextTotalStudents,
        existing,
        startSeq
      );
      const nextMaxSeq = nextRoster.reduce(
        (max, stu) => Math.max(max, parseStudentSeq(stu.id)),
        startSeq - 1
      );
      return {
        students: nextRoster,
        totalStudents: nextRoster.length,
        nextStudentSeq: nextMaxSeq + 1,
      };
    },

    async addStudent(classroom) {
      return this.adjustStudents(classroom, 1);
    },

    async removeStudent(classroom, studentId) {
      const nextRoster = (classroom.students || []).filter(
        (s) => s.id !== studentId
      );
      return {
        students: nextRoster,
        totalStudents: nextRoster.length,
      };
    },

    async simulateSubmission(schedule, classroom) {
      const students = classroom?.students || [];
      const scores = schedule?.scores || {};
      const nextUnsubmitted = students.find(
        (stu) =>
          typeof scores[stu.id] !== 'number' || Number.isNaN(scores[stu.id])
      );
      if (!nextUnsubmitted) return null;
      return {
        studentId: nextUnsubmitted.id,
        score: Math.floor(68 + Math.random() * 31),
      };
    },

    async decrementSubmission(schedule, classroom) {
      const students = classroom?.students || [];
      const scores = schedule?.scores || {};
      const lastScored = [...students]
        .reverse()
        .find(
          (stu) =>
            typeof scores[stu.id] === 'number' && !Number.isNaN(scores[stu.id])
        );
      if (!lastScored) return null;
      return { studentId: lastScored.id };
    },
  };
}
