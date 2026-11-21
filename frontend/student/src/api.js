export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.detail?.error || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

export const STATUS_META = {
  notStarted: {
    label: 'Not started',
    shortLabel: 'Not started',
    tone: 'slate',
  },
  inProgress: {
    label: 'In progress',
    shortLabel: 'In progress',
    tone: 'green',
  },
  submitted: {
    label: 'Submitted · awaiting review',
    shortLabel: 'Awaiting review',
    tone: 'amber',
  },
  released: {
    label: 'Results released',
    shortLabel: 'Released',
    tone: 'emerald',
  },
};

export function statusInfo(status) {
  return STATUS_META[status] || STATUS_META.notStarted;
}

export function getInitials(name) {
  const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'S';
}

export function getFirstName(name) {
  return String(name || 'Student').trim().split(/\s+/)[0] || 'Student';
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function extractObjectives(activity) {
  if (!Array.isArray(activity?.objectives)) return [];
  return activity.objectives
    .map((item) => (typeof item === 'string' ? item : item?.title || item?.name || item?.description || ''))
    .filter(Boolean);
}

export function clearStoredSession() {
  try {
    sessionStorage.removeItem('assembly_pc_token');
    localStorage.removeItem('assembly_pc_token');
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('studentId');
    sessionStorage.removeItem('userEmail');
  } catch {}
}
