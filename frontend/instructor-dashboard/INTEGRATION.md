# Integrating the Assembly PC Instructor Dashboard

`<InstructorDashboard />` is decoupled from placeholder mock data and global page CSS so it runs directly against the AssemblyProj FastAPI backend (via `createApiDashboardAdapter()`) or inside a host React shell with controlled state.

---

## Where Files Go Inside `AssemblyProj`

- **`frontend/instructor-dashboard/`** — Contains the React Instructor Dashboard UI, scoped styles, domain logic (`src/domain/dashboardLogic.js`), the live FastAPI adapter (`src/adapters/apiAdapter.js`), `InviteStudentModal`, and the optional standalone placeholder adapter (`src/adapters/placeholderAdapter.js`).
- **`backend/` (FastAPI + PostgreSQL Persistence)**:
  1. **PostgreSQL schema (`backend/schemas/database_schema.sql` & `backend/scripts/setup_database.py`)** defines five tables: `classrooms`, `classroom_enrollments`, `classroom_invitations`, `classroom_activities`, and `activity_submissions`.
  2. **FastAPI router (`backend/api/routes/instructor_dashboard.py`, mounted in `backend/app.py`)** serves the live `/api/instructor/*` and `/api/student/*` routes, mounts built assets at `/instructor/assets`, and serves `/instructor` for authenticated instructors.

---

## 1. Module Architecture

| File / Folder | Purpose | Notes |
| --- | --- | --- |
| `src/InstructorDashboard.jsx` | Embeddable dashboard component | Defaults `enableDemoControls` to `false`. Supports `inviteStudent`, `cancelInvitation`, `removeStudent`, and `401` session-expired recovery links to `/`. |
| `src/index.js` | Component barrel exports | Exports `<InstructorDashboard />` and UI subcomponents including `<InviteStudentModal />`. |
| `src/components/InviteStudentModal.jsx` | Student invitation & join-code modal | Displays `classroom?.joinCode` with a copy control (`aria-live="polite"`) and an async-safe form (`identifier`, `Send Invitation`) with inline `.form-error` handling. |
| `src/components/ActivityDetailView.jsx` | Activity stats & score grading table | Buffers score edits in local `draftScores` and commits `onUpdateStudentScore` on `onBlur` or `Enter` to avoid rate-limit spam (60 req/min). |
| `src/adapters/apiAdapter.js` | Live FastAPI REST adapter | Exports `createApiDashboardAdapter({ baseUrl = '' } = {})` using `credentials: 'include'` and FastAPI error extraction (`data?.detail?.error \|\| data?.error \|\| data?.detail \|\| 'Request failed'`). |
| `src/domain/dashboardLogic.js` | Pure domain calculations, status lifecycle, and normalization | Framework-agnostic ES module with zero placeholder data. |
| `src/App.css` | Scoped styles (`.apc-dashboard`, `.apc-dialog`) | Imported automatically by `InstructorDashboard.jsx`; safe inside host layouts. |
| `src/adapters/placeholderAdapter.js` | In-memory demo adapter & mock student names | Used only in standalone demo mode when `VITE_USE_PLACEHOLDER_DATA=true`. |
| `src/App.jsx` & `src/main.jsx` | Standalone Vite entry point | Uses `createApiDashboardAdapter()` with `enableDemoControls={false}` by default; falls back to `createInMemoryDashboardAdapter()` with `enableDemoControls={true}` when `import.meta.env.VITE_USE_PLACEHOLDER_DATA === 'true'`. |
| `vite.config.js` | Vite build & dev proxy config | Sets `base: '/instructor/'` on `build`, `base: '/'` on `serve`, and proxies `/api` to `http://127.0.0.1:5000`. |

---

## 2. Canonical Data Contracts

Backend payloads do **not** need pre-formatted UI badge fields (`day`, `dateNum`, `dueDateLabel`, `className`) or full student arrays when rendering summary lists.

### `Student`
```ts
interface Student {
  id: string;        // Stringified student_id
  name: string;      // Student display name
  schoolId?: string; // School ID when returned by the API
  email?: string;    // Student email when returned by the API
}
```

### `ClassroomInvitation`
```ts
interface ClassroomInvitation {
  id: string;        // Stringified invitation_id from classroom_invitations
  studentId: string; // Stringified student_id
  name: string;      // Invited student's display name
  schoolId?: string;
  email?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: string;
}
```

### `Classroom`
```ts
interface Classroom {
  id: string;
  name: string;
  displayName?: string;        // Optional; falls back to `name`
  joinCode?: string;
  capacity?: number | null;
  students?: Student[];        // Optional on summary lists; empty [] preserves `totalStudents`
  invitations?: ClassroomInvitation[]; // Pending rows from `classroom_invitations`
  totalStudents?: number;      // Derived from `students.length` when `students` is non-empty
  submitted?: number;          // Optional summary fallback when `students` is not loaded
  atRisk?: number;             // Computed from `students` when present; preserved when `students` is []
  avgGrade?: string;           // e.g. "88%" or "—"; computed from `students` when present
  nextActivity?: string;
  activityStatus?: 'none' | 'scheduled' | 'active' | 'closed' | 'finished';
  activeScheduleId?: string | null;
  metricType?: string;
}
```

### `ActivitySchedule`
```ts
interface ActivitySchedule {
  id: string;
  classId: string;
  className?: string;          // Derived from matching classroom if omitted
  activityName: string;
  dateValue: string;           // "YYYY-MM-DD"
  timeValue?: string;          // "HH:mm" (defaults to "00:00" in lifecycle checks)
  dueDateValue?: string;       // "YYYY-MM-DD"
  dueTimeValue?: string;       // "HH:mm" (defaults to "23:59" in lifecycle checks)
  day?: string;                // Derived automatically from `dateValue` (e.g. "NOV")
  dateNum?: string;            // Derived automatically from `dateValue` (e.g. "19")
  dueDateLabel?: string;       // Derived automatically from `dueDateValue` + `dueTimeValue`
  isLocked?: boolean;
  manualOverride?: boolean;
  status?: 'scheduled' | 'active' | 'closed' | 'finished';
  scores?: Record<string, number>; // Map of studentId -> numeric score (0–100)
  submitted?: number;          // Used when `classroom.students` is []
  activityAvg?: string;        // Used when `classroom.students` is []
}
```

> **Note:** `reconcileSchedulesWithClasses` never fabricates placeholder student rows when `students` is `[]`. If `totalStudents > 0` without loaded student rows, summary metrics (`avgGrade`, `atRisk`) are preserved on classrooms and `Students List` displays a clean summary message.

---

## 3. `<InstructorDashboard />` Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `adapter` | `DashboardDataAdapter` | In-memory demo adapter | Async persistence hooks (`loadInitialData`, `createClassroom`, `inviteStudent`, `cancelInvitation`, `removeStudent`, `saveSchedule`, `deleteSchedule`, `toggleScheduleLock`, `updateStudentScore`, `updateInstructorName`, plus optional demo hooks `addStudent` / `adjustStudents`). |
| `classes` | `Classroom[]` | `undefined` | Controlled classrooms state. |
| `schedules` | `ActivitySchedule[]` | `undefined` | Controlled schedules state. |
| `instructorName` | `string` | `undefined` | Controlled instructor display name. |
| `initialClasses` | `Classroom[]` | `[]` | Initial classrooms in uncontrolled mode (ignored if `adapter.loadInitialData` loads data). |
| `initialSchedules` | `ActivitySchedule[]` | `[]` | Initial schedules in uncontrolled mode. |
| `initialInstructorName` | `string` | `'Instructor Name'` | Initial instructor name in uncontrolled mode. |
| `onClassesChange` | `(classes: Classroom[]) => void` | `undefined` | Called with synced classroom objects after mutations. |
| `onSchedulesChange` | `(schedules: ActivitySchedule[]) => void` | `undefined` | Called with reconciled schedule objects after mutations. |
| `onInstructorNameChange` | `(name: string) => void` | `undefined` | Called after instructor name updates. |
| `enableDemoControls` | `boolean` | `false` | Shows prototype simulation controls (`-1/+1 Student`, `-1/+1 Submission`, `+ Simulate Submission`, `Grade 85%`). Keep `false` in production. |
| `showSidebar` | `boolean` | `true` | Pass `false` when rendering inside a host shell that provides its own navigation chrome. |
| `activeView` | `'home' \| 'schedules' \| 'classrooms' \| 'class-detail' \| 'activity-detail'` | `undefined` | Controlled view state for integrating with a host router (e.g. React Router). |
| `onViewChange` | `(view: string) => void` | `undefined` | Callback whenever navigation changes inside the dashboard. |
| `isLoading` | `boolean` | `false` | Displays a loading banner inside the dashboard content area. |
| `error` | `string \| null` | `null` | Displays an error alert banner inside the dashboard. |
| `lifecycleCheckIntervalMs` | `number` | `15000` | Interval in ms for automatic start/due lifecycle transitions (`0` disables polling). |
| `className` | `string` | `''` | Optional additional CSS class on the `.apc-dashboard` root container. |

---

## 4. Live FastAPI Endpoints & Adapter Contract

`src/adapters/apiAdapter.js` implements `createApiDashboardAdapter({ baseUrl = '' } = {})` with `credentials: 'include'` against these FastAPI endpoints:

### Instructor Endpoints (requires authenticated `instructor` role)

| Method & Path | Adapter Method | Request Body | Response Payload |
| --- | --- | --- | --- |
| `GET /api/instructor/dashboard` | `loadInitialData()` | — | `{ ok, instructorName, classes, schedules }` |
| `POST /api/instructor/classrooms` | `createClassroom(payload)` | `{ name, displayName?, joinCode?, capacity? }` | `{ ok, classroom }` -> returns `data.classroom` |
| `POST /api/instructor/classrooms/{classroomId}/invitations` | `inviteStudent(classroom, identifier)` | `{ identifier }` | `{ ok, invitation, invitations }` -> returns `{ invitations: data.invitations }` |
| `DELETE /api/instructor/classrooms/{classroomId}/invitations/{invitationId}` | `cancelInvitation(classroom, invitationId)` | — | `{ ok, invitations }` -> returns `{ invitations: data.invitations }` |
| `DELETE /api/instructor/classrooms/{classroomId}/students/{studentId}` | `removeStudent(classroom, studentId)` | — | `{ ok, students, totalStudents }` -> returns `{ students: data.students, totalStudents: data.totalStudents }` |
| `POST /api/instructor/schedules` | `saveSchedule(payload)` (create) | `{ classId, activityName, dateValue, timeValue, dueDateValue, dueTimeValue, isLocked?, manualOverride?, scenarioId? }` | `{ ok, schedule }` -> returns `data.schedule` |
| `PUT /api/instructor/schedules/{activityId}` | `saveSchedule(payload)` (update) | Same as create | `{ ok, schedule }` -> returns `data.schedule` |
| `DELETE /api/instructor/schedules/{activityId}` | `deleteSchedule(scheduleId)` | — | `{ ok }` |
| `PATCH /api/instructor/schedules/{activityId}/lock` | `toggleScheduleLock(scheduleId, nextLocked)` | `{ isLocked: nextLocked, manualOverride: true }` | `{ ok, isLocked, manualOverride }` |
| `PUT /api/instructor/schedules/{activityId}/scores/{studentId}` | `updateStudentScore(scheduleId, studentId, score)` | `{ score }` (`0..100` integer or `null`) | `{ ok, score }` -> returns `data.score` |
| `PATCH /api/instructor/profile` | `updateInstructorName(name)` | `{ name }` | `{ ok, instructorName }` -> returns `data.instructorName` |

### Student Companion Endpoints (backed by `classroom_enrollments` & `classroom_invitations`)

- `POST /api/student/classrooms/join` (`{ joinCode }`) — Enrolls the student and marks any matching pending row in `classroom_invitations` as `'accepted'`.
- `GET /api/student/invitations` — Returns pending classroom invitations for the authenticated student.
- `POST /api/student/invitations/{invitationId}/respond` (`{ action: 'accept' | 'decline' }`) — Enrolls on `'accept'` (respecting `student_capacity`) or marks `'declined'`.

---

## 5. Integration Examples

### Option A: Live FastAPI Adapter (Default in `src/App.jsx`)

```jsx
import { useState } from 'react';
import { InstructorDashboard } from './index';
import { createApiDashboardAdapter } from './adapters/apiAdapter';

export function HostInstructorPage({ showShellSidebar = false }) {
  const [adapter] = useState(() => createApiDashboardAdapter());

  return (
    <InstructorDashboard
      adapter={adapter}
      showSidebar={showShellSidebar}
      enableDemoControls={false}
    />
  );
}
```

### Option B: Controlled Host Store (Redux / Zustand / React Query)

```jsx
import { InstructorDashboard } from './index';

export function ControlledDashboardPage({
  classes,
  schedules,
  currentUser,
  onClassesChange,
  onSchedulesChange,
  isFetching,
  queryError,
}) {
  return (
    <InstructorDashboard
      classes={classes}
      schedules={schedules}
      instructorName={currentUser.name}
      onClassesChange={onClassesChange}
      onSchedulesChange={onSchedulesChange}
      isLoading={isFetching}
      error={queryError?.message || null}
      showSidebar={false}
      enableDemoControls={false}
    />
  );
}
```

### Building & Local Development

- **Dev server (with FastAPI proxy):** `npm run dev` serves at `/` and proxies `/api/*` to `http://127.0.0.1:5000`. Set `VITE_USE_PLACEHOLDER_DATA=true` to preview offline with in-memory demo data and demo simulation buttons.
- **Production bundle:** `npm run build` outputs to `dist/` with `base: '/instructor/'`, served by FastAPI at `GET /instructor` and `/instructor/assets`.

---

## 6. CSS Scoping

All dashboard rules in `src/App.css` use tokens, box-sizing, typography, and modal styling scoped to `.apc-dashboard` and `dialog.apc-dialog`. Host applications do **not** need `src/index.css` (which only styles `html, body` for the standalone preview).
