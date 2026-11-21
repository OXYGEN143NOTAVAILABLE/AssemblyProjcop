function parseErrorMessage(data, status) {
  const rawMessage =
    data?.detail?.error ||
    data?.error ||
    (typeof data?.detail === 'string' ? data.detail : '') ||
    (Array.isArray(data?.detail) && data.detail[0]?.msg
      ? String(data.detail[0].msg)
      : '');

  if (rawMessage) {
    return rawMessage;
  }

  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  return 'Request failed';
}

/**
 * Live REST API adapter backed by the AssemblyProj FastAPI endpoints.
 *
 * @param {{ baseUrl?: string }} [options]
 * @returns {import('../domain/dashboardLogic').DashboardDataAdapter}
 */
export function createApiDashboardAdapter({ baseUrl = '' } = {}) {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/+$/, '');

  async function request(path, { method = 'GET', body, headers } = {}) {
    const res = await fetch(`${normalizedBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const error = new Error(parseErrorMessage(data, res.status));
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data || {};
  }

  return {
    async loadInitialData() {
      const data = await request('/api/instructor/dashboard');
      return {
        classes: Array.isArray(data.classes) ? data.classes : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
        instructorName: data.instructorName,
      };
    },

    async createClassroom(payload) {
      const data = await request('/api/instructor/classrooms', {
        method: 'POST',
        body: payload,
      });
      return data.classroom;
    },

    async inviteStudent(classroom, identifier) {
      const data = await request(
        `/api/instructor/classrooms/${encodeURIComponent(classroom.id)}/invitations`,
        {
          method: 'POST',
          body: { identifier },
        }
      );
      return {
        invitations: Array.isArray(data.invitations) ? data.invitations : [],
      };
    },

    async cancelInvitation(classroom, invitationId) {
      const data = await request(
        `/api/instructor/classrooms/${encodeURIComponent(classroom.id)}/invitations/${encodeURIComponent(invitationId)}`,
        {
          method: 'DELETE',
        }
      );
      return {
        invitations: Array.isArray(data.invitations) ? data.invitations : [],
      };
    },

    async removeStudent(classroom, studentId) {
      const data = await request(
        `/api/instructor/classrooms/${encodeURIComponent(classroom.id)}/students/${encodeURIComponent(studentId)}`,
        {
          method: 'DELETE',
        }
      );
      return {
        students: Array.isArray(data.students) ? data.students : [],
        totalStudents: data.totalStudents,
      };
    },

    async saveSchedule(payload) {
      const isUpdate = Boolean(payload?.id);
      const path = isUpdate
        ? `/api/instructor/schedules/${encodeURIComponent(payload.id)}`
        : '/api/instructor/schedules';
      const data = await request(path, {
        method: isUpdate ? 'PUT' : 'POST',
        body: payload,
      });
      return data.schedule;
    },

    async deleteSchedule(scheduleId) {
      await request(
        `/api/instructor/schedules/${encodeURIComponent(scheduleId)}`,
        {
          method: 'DELETE',
        }
      );
    },

    async toggleScheduleLock(scheduleId, nextLocked) {
      const data = await request(
        `/api/instructor/schedules/${encodeURIComponent(scheduleId)}/lock`,
        {
          method: 'PATCH',
          body: {
            isLocked: nextLocked,
            manualOverride: true,
          },
        }
      );
      return {
        isLocked: data.isLocked,
        manualOverride: data.manualOverride,
      };
    },

    async updateStudentScore(scheduleId, studentId, score) {
      const data = await request(
        `/api/instructor/schedules/${encodeURIComponent(scheduleId)}/scores/${encodeURIComponent(studentId)}`,
        {
          method: 'PUT',
          body: { score },
        }
      );
      return data.score;
    },

    async updateInstructorName(name) {
      const data = await request('/api/instructor/profile', {
        method: 'PATCH',
        body: { name },
      });
      return data.instructorName;
    },
  };
}
