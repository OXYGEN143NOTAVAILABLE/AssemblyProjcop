import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { AppDatabase } from './server/db.mjs';
import {
  canStudentStartActivity,
  computeStudentDashboardStats,
  sanitizeActivityForStudent,
  validateJoinCode,
} from './server/studentLogic.mjs';
import {
  ADMIN_SCHEMAS,
  ADMIN_TABLES,
  CATEGORY_INFO,
  adminCpuToSim,
  adminFanToSim,
  adminGpuToSim,
  adminMoboToSim,
  adminPsuToSim,
  adminRamToSim,
  adminStorageToSim,
  buildReport,
  cleanText,
  extractNumericId,
  isInstitutionalEmail,
  matchesQuery,
  normalizeAdminCategory,
  normalizeCategory,
  normalizeEmail,
  searchTerms,
  validateBoolean,
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
} from './server/logic.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';
const SESSION_SECRET = process.env.ADMIN_SECRET || 'assembly-pc-dev-session-secret-change-in-prod';
const ADMIN_COOKIE_NAME = 'assembly_admin_session';
const APP_COOKIE_NAME = 'assembly_app_session';
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;
const APP_SESSION_SECONDS = 60 * 60 * 24 * 7;

const db = new AppDatabase();
const store = db.loadStore();
const revokedTokens = new Set();
const loginAttempts = new Map();

// ============================================================
// SESSION & AUTH HELPERS
// ============================================================

function signPayload(payloadObj) {
  const data = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.') || revokedTokens.has(token)) {
    return null;
  }
  const [data, sig] = token.split('.', 2);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isHttpsRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function cookieOptions(req, maxAgeMs = null) {
  const https = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    ...(https ? { partitioned: true } : {}),
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

function createAppSessionToken(role, subject) {
  return signPayload({
    role,
    subject,
    exp: Date.now() + APP_SESSION_SECONDS * 1000,
  });
}

function setAppSessionCookie(req, res, role, subject, remember = true) {
  const token = createAppSessionToken(role, subject);
  res.cookie(APP_COOKIE_NAME, token, cookieOptions(req, remember ? APP_SESSION_SECONDS * 1000 : null));
  return token;
}

function setAdminSessionCookie(req, res, username) {
  const token = signPayload({
    username,
    exp: Date.now() + ADMIN_SESSION_SECONDS * 1000,
  });
  res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions(req, ADMIN_SESSION_SECONDS * 1000));
  return token;
}

function clearAuthCookies(req, res) {
  const opts = cookieOptions(req);
  delete opts.maxAge;
  res.clearCookie(APP_COOKIE_NAME, opts);
  res.clearCookie(ADMIN_COOKIE_NAME, opts);
}

function extractBearerToken(req) {
  const auth = String(req.headers?.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim() || null;
}

function checkAccountLockout(identifier) {
  const rec = loginAttempts.get(String(identifier || '').toLowerCase());
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
    loginAttempts.delete(String(identifier || '').toLowerCase());
  }
  return false;
}

function recordLoginAttempt(identifier, success) {
  const key = String(identifier || '').toLowerCase();
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  const rec = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= 8) {
    rec.lockedUntil = Date.now() + 5 * 60 * 1000;
  }
  loginAttempts.set(key, rec);
}

function publicProfileUrl(user) {
  if (!user) return '/profile';
  if (user.role === 'admin') return '/admin';
  return user.role && user.id ? `/profiles/${user.role}/${user.id}` : '/profile';
}

function publicStudentUser(user) {
  const pub = {
    id: user.student_id,
    role: 'student',
    studentId: user.school_id,
    email: user.email,
    displayName: user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
  };
  pub.profileUrl = publicProfileUrl(pub);
  return pub;
}

function publicInstructorUser(user) {
  const pub = {
    id: user.admin_id,
    role: user.role || 'instructor',
    email: user.username,
    displayName: user.display_name || user.username,
  };
  pub.profileUrl = publicProfileUrl(pub);
  return pub;
}

function resolveUserFromAppData(appData) {
  if (!appData) return null;
  const { role, subject } = appData;
  if (role === 'student') {
    const user = store.student_users.find(
      (u) => u.is_active && u.school_id.toLowerCase() === String(subject).toLowerCase()
    );
    return user ? publicStudentUser(user) : null;
  }
  if (role === 'instructor') {
    const user = store.admin_users.find((u) => u.is_active && u.username === subject);
    return user ? publicInstructorUser(user) : null;
  }
  if (role === 'admin') {
    const user = store.admin_users.find(
      (u) => u.is_active && u.username === subject && u.role === 'admin'
    );
    return user ? publicInstructorUser(user) : null;
  }
  return null;
}

function currentAuthUser(req) {
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const bearerData = verifyToken(bearerToken);
    const resolved = resolveUserFromAppData(bearerData);
    if (resolved) return resolved;
  }

  const appToken = req.cookies?.[APP_COOKIE_NAME];
  const appData = verifyToken(appToken);
  const resolvedCookieUser = resolveUserFromAppData(appData);
  if (resolvedCookieUser) return resolvedCookieUser;

  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const adminData = verifyToken(adminToken);
  if (adminData) {
    const user = store.admin_users.find((u) => u.is_active && u.username === adminData.username);
    return user ? publicInstructorUser(user) : null;
  }

  return null;
}

function requireLoggedIn(req, res) {
  const user = currentAuthUser(req);
  if (!user) {
    res.status(401).json({ detail: { error: 'Login required' } });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const adminData = verifyToken(req.cookies?.[ADMIN_COOKIE_NAME]);
  if (!adminData) {
    const user = currentAuthUser(req);
    if (user && user.role === 'admin') return user.email;
    res.status(401).json({ detail: { error: 'Admin login required' } });
    return null;
  }
  return adminData.username;
}

function requireInstructor(req, res) {
  const user = requireLoggedIn(req, res);
  if (!user) return null;
  if (user.role !== 'instructor') {
    res.status(403).json({ detail: { error: 'Instructor access required' } });
    return null;
  }
  return user;
}

// ============================================================
// DATA ACCESS & MAPPER HELPERS
// ============================================================

function fetchAllComponentsGrouped() {
  return {
    cpu: store.components.cpu.map(adminCpuToSim),
    mb: store.components.mobo.map(adminMoboToSim),
    ram: store.components.ram.map(adminRamToSim),
    gpu: store.components.gpu.map(adminGpuToSim),
    storage: [
      ...store.components.ssd.map((r) => adminStorageToSim(r, 'ssd')),
      ...store.components.hdd.map((r) => adminStorageToSim(r, 'hdd')),
    ],
    psu: store.components.psu.map(adminPsuToSim),
    case: [],
    cooler: store.components.fan.map(adminFanToSim),
  };
}

function fetchComponentsByCategory(category) {
  const norm = normalizeCategory(category);
  const grouped = fetchAllComponentsGrouped();
  return norm && grouped[norm] ? grouped[norm] : [];
}

function fetchComponent(category, componentId) {
  const norm = normalizeCategory(category);
  const numId = extractNumericId(componentId);
  if (!norm || !numId) return null;
  return fetchComponentsByCategory(norm).find((c) => Number(c.id) === Number(numId)) || null;
}

function getCreatorInfo(ownerRole, ownerId) {
  if (ownerRole === 'student') {
    const s = store.student_users.find((u) => u.student_id === ownerId);
    return {
      creator_name: s?.display_name || 'Unknown creator',
      creator_email: s?.email || null,
    };
  }
  if (ownerRole === 'instructor' || ownerRole === 'admin') {
    const a = store.admin_users.find((u) => u.admin_id === ownerId);
    return {
      creator_name: a?.display_name || a?.username || 'Unknown creator',
      creator_email: a?.username || null,
    };
  }
  return { creator_name: 'Unknown creator', creator_email: null };
}

function decorateBuildRow(row, currentUser) {
  const creator = getCreatorInfo(row.owner_role, row.owner_id);
  const heartCount = store.build_hearts.filter((h) => h.build_id === row.build_id).length;
  const favoriteCount = store.build_favorites.filter((f) => f.build_id === row.build_id).length;
  const hearted = currentUser
    ? store.build_hearts.some(
        (h) => h.build_id === row.build_id && h.user_role === currentUser.role && h.user_id === currentUser.id
      )
    : false;
  const favorited = currentUser
    ? store.build_favorites.some(
        (f) => f.build_id === row.build_id && f.user_role === currentUser.role && f.user_id === currentUser.id
      )
    : false;

  return {
    id: row.build_id,
    build_id: row.build_id,
    name: row.build_name,
    build_name: row.build_name,
    build_data: row.build_data,
    components: row.build_data?.components || {},
    stats: row.build_data?.stats || {},
    owner_role: row.owner_role,
    owner_id: row.owner_id,
    ...creator,
    is_published: row.is_published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    heartCount,
    favoriteCount,
    hearted,
    favorited,
  };
}

function scenarioRowToPublic(row) {
  const inst = store.admin_users.find((u) => u.admin_id === row.instructor_id);
  return {
    id: row.scenario_id,
    title: row.title,
    description: row.description || '',
    activityType: row.activity_type || 'build',
    tier: row.tier || '',
    budget: row.budget !== null && row.budget !== undefined ? Number(row.budget) : null,
    timeLimitMinutes: row.time_limit_minutes ?? null,
    objectives: row.objectives || [],
    troubleshooting: row.troubleshooting || [],
    constraints: row.constraints || {},
    isPublished: Boolean(row.is_published),
    instructor: {
      id: row.instructor_id,
      displayName: inst?.display_name || inst?.username || 'Instructor',
      email: inst?.username || null,
      profileUrl: row.instructor_id ? `/profiles/instructor/${row.instructor_id}` : null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function awardBadge(userRole, userId, key, name, description) {
  const exists = store.user_badges.some(
    (b) => b.user_role === userRole && b.user_id === userId && b.badge_key === key
  );
  if (!exists) {
    const inserted = db.insertBadge({
      user_role: userRole,
      user_id: userId,
      badge_key: key,
      badge_name: name,
      badge_description: description,
      earned_at: new Date().toISOString(),
    });
    store.user_badges.push(inserted);
  }
}

function syncUserBadges(user) {
  const role = user?.role;
  const userId = Number(user?.id || 0);
  if (!role || !userId) return [];

  const buildCount = store.saved_builds.filter(
    (b) => b.owner_role === role && b.owner_id === userId
  ).length;
  const completionCount = store.scenario_completions.filter(
    (c) => c.user_role === role && c.user_id === userId
  ).length;

  for (const m of [1, 10, 100]) {
    if (buildCount >= m) {
      awardBadge(role, userId, `build_${m}`, `${m} Build${m > 1 ? 's' : ''}`, `Created ${m} published build${m > 1 ? 's' : ''}.`);
    }
  }
  for (const m of [1, 10, 50, 100]) {
    if (completionCount >= m) {
      awardBadge(role, userId, `scenario_${m}`, `${m} Scenario${m > 1 ? 's' : ''}`, `Completed ${m} instructor scenario${m > 1 ? 's' : ''}.`);
    }
  }

  return store.user_badges
    .filter((b) => b.user_role === role && b.user_id === userId)
    .sort((a, b) => b.earned_at.localeCompare(a.earned_at))
    .map((b) => ({
      ...b,
      key: b.badge_key,
      name: b.badge_name,
      description: b.badge_description,
      earnedAt: b.earned_at,
    }));
}

function getPublicProfile(role, profileId) {
  const normRole = cleanText(role).toLowerCase();
  const numId = Number(profileId);
  if (normRole === 'student') {
    const row = store.student_users.find((u) => u.is_active && u.student_id === numId);
    if (!row) return null;
    const pub = publicStudentUser(row);
    pub.joinedAt = row.created_at;
    return pub;
  }
  if (['instructor', 'admin', 'teacher'].includes(normRole)) {
    const row = store.admin_users.find(
      (u) => u.is_active && u.admin_id === numId && u.role === 'instructor'
    );
    if (!row) return null;
    const pub = publicInstructorUser(row);
    pub.joinedAt = row.created_at;
    return pub;
  }
  return null;
}

function createStudentUser(payload) {
  const firstName = validateName(cleanText(payload.firstName ?? payload.first_name ?? ''), 'First name');
  const lastName = validateName(cleanText(payload.lastName ?? payload.last_name ?? ''), 'Last name');
  const emailValue = validateEmail(payload.email);
  const schoolId = validateUsername(cleanText(payload.studentId ?? payload.student_id ?? payload.school_id ?? ''));
  const password = validatePassword(String(payload.password ?? ''));

  const existing = store.student_users.find(
    (u) => u.school_id.toLowerCase() === schoolId.toLowerCase() || u.email.toLowerCase() === emailValue.toLowerCase()
  );
  if (existing) {
    const err = new Error(
      existing.school_id.toLowerCase() === schoolId.toLowerCase()
        ? 'Account with this Student ID already exists'
        : 'Account with this email address already exists'
    );
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const user = db.insertStudent({
    school_id: schoolId,
    email: emailValue,
    password_hash: bcrypt.hashSync(password, 10),
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`.trim(),
    is_active: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });
  store.student_users.push(user);
  return user;
}

function createInstructorUser(payload) {
  let firstName = cleanText(payload.firstName ?? payload.first_name ?? '');
  let lastName = cleanText(payload.lastName ?? payload.last_name ?? '');
  const rawDisplay = cleanText(payload.displayName ?? payload.display_name ?? '');

  if (!firstName && rawDisplay) {
    const parts = rawDisplay.split(/\s+/);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || parts[0] || '';
  }

  firstName = validateName(firstName, 'First name');
  lastName = validateName(lastName || firstName, 'Last name');
  const emailValue = validateEmail(payload.email);
  const department = cleanText(payload.department ?? '');
  const password = validatePassword(String(payload.password ?? ''));

  if (!isInstitutionalEmail(emailValue)) {
    const err = new Error('Please use an approved institutional email address (@lnu.edu.ph)');
    err.status = 400;
    throw err;
  }

  const existing = store.admin_users.find((u) => u.username.toLowerCase() === emailValue.toLowerCase());
  if (existing) {
    const err = new Error('Account with this email address already exists');
    err.status = 409;
    throw err;
  }

  let displayName = rawDisplay || `${firstName} ${lastName}`.trim();
  if (department) displayName = `${displayName} (${department})`;
  const now = new Date().toISOString();
  const user = db.insertAdminUser({
    username: emailValue,
    password_hash: bcrypt.hashSync(password, 10),
    display_name: displayName,
    role: 'instructor',
    is_active: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });
  store.admin_users.push(user);
  return user;
}

// ============================================================
// EXPRESS APP
// ============================================================

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

function sendError(res, err) {
  const status = err.status || 400;
  return res.status(status).json({ detail: { error: err.message || 'Request failed' } });
}

// Health & DB Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Express backend is running', framework: 'Node.js Express' });
});

app.get('/api/db-check', (_req, res) => {
  res.json({
    status: 'connected',
    database_name: 'assemblypc.db (sqlite)',
    database_user: 'node',
    server_port: PORT,
    counts: db.stats(),
  });
});

// Auth Routes
app.post('/api/auth/register', (req, res) => {
  try {
    const payload = req.body || {};
    const role = cleanText(payload.role).toLowerCase();
    const remember = validateBoolean(payload.rememberMe ?? true);

    if (role === 'student') {
      const user = createStudentUser(payload);
      const pub = publicStudentUser(user);
      const token = setAppSessionCookie(req, res, 'student', user.school_id, remember);
      return res.json({ ok: true, user: pub, token, redirectUrl: '/student/dashboard' });
    }
    if (['instructor', 'teacher', 'admin'].includes(role)) {
      const user = createInstructorUser(payload);
      const pub = publicInstructorUser(user);
      const token = setAppSessionCookie(req, res, 'instructor', user.username, remember);
      return res.json({ ok: true, user: pub, token, redirectUrl: '/simulator' });
    }
    return res.status(400).json({ detail: { error: 'Role must be student, instructor, or admin' } });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const payload = req.body || {};
    const role = cleanText(payload.role || '').toLowerCase();
    const password = String(payload.password || '');
    const remember = validateBoolean(payload.rememberMe ?? false);

    if (!password) {
      return res.status(400).json({ detail: { error: 'Password is required' } });
    }

    if (role === 'student') {
      const schoolId = cleanText(payload.studentId || payload.student_id || payload.school_id || '');
      if (!schoolId) return res.status(400).json({ detail: { error: 'Student ID is required' } });
      if (checkAccountLockout(schoolId)) {
        return res.status(429).json({ detail: { error: 'Account locked due to too many failed attempts. Please try again later.' } });
      }
      const user = store.student_users.find(
        (u) => u.is_active && (u.school_id.toLowerCase() === schoolId.toLowerCase() || u.email.toLowerCase() === schoolId.toLowerCase())
      );
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        recordLoginAttempt(schoolId, false);
        return res.status(401).json({ detail: { error: 'Invalid student ID or password' } });
      }
      recordLoginAttempt(schoolId, true);
      user.last_login_at = new Date().toISOString();
      db.updateStudentLogin(user.student_id, user.last_login_at);
      const token = setAppSessionCookie(req, res, 'student', user.school_id, remember);
      return res.json({ ok: true, user: publicStudentUser(user), token, redirectUrl: '/student/dashboard' });
    }

    if (role === 'admin') {
      const username = cleanText(payload.email || payload.username || '');
      if (!username) return res.status(400).json({ detail: { error: 'Username is required' } });
      if (checkAccountLockout(username)) {
        return res.status(429).json({ detail: { error: 'Account locked due to too many failed attempts. Please try again later.' } });
      }
      const user = store.admin_users.find((u) => u.is_active && u.username === username && u.role === 'admin');
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        recordLoginAttempt(username, false);
        return res.status(401).json({ detail: { error: 'Invalid administrator credentials' } });
      }
      recordLoginAttempt(username, true);
      user.last_login_at = new Date().toISOString();
      db.updateAdminLogin(user.admin_id, user.last_login_at);
      const token = setAppSessionCookie(req, res, 'admin', user.username, remember);
      setAdminSessionCookie(req, res, user.username);
      return res.json({ ok: true, user: publicInstructorUser(user), token, redirectUrl: '/admin' });
    }

    if (role === 'instructor' || role === 'teacher') {
      const email = normalizeEmail(payload.email || payload.username || '');
      if (!email) return res.status(400).json({ detail: { error: 'Email is required' } });
      if (checkAccountLockout(email)) {
        return res.status(429).json({ detail: { error: 'Account locked due to too many failed attempts. Please try again later.' } });
      }
      const user = store.admin_users.find((u) => u.is_active && u.username.toLowerCase() === email && u.role === 'instructor');
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        recordLoginAttempt(email, false);
        return res.status(401).json({ detail: { error: 'Invalid instructor credentials' } });
      }
      recordLoginAttempt(email, true);
      user.last_login_at = new Date().toISOString();
      db.updateAdminLogin(user.admin_id, user.last_login_at);
      const token = setAppSessionCookie(req, res, 'instructor', user.username, remember);
      return res.json({ ok: true, user: publicInstructorUser(user), token, redirectUrl: '/simulator' });
    }

    return res.status(400).json({ detail: { error: 'Role must be student, instructor, or admin' } });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post('/api/auth/forgot-password', (req, res) => {
  try {
    const payload = req.body || {};
    const role = cleanText(payload.role || '').toLowerCase();
    const password = validatePassword(String(payload.password || ''));
    const pwHash = bcrypt.hashSync(password, 10);

    if (role === 'student') {
      const schoolId = cleanText(payload.studentId || payload.student_id || payload.school_id || '');
      const emailValue = normalizeEmail(payload.email || '');
      if (!schoolId || !emailValue) {
        return res.status(400).json({ detail: { error: 'Student ID and email are required' } });
      }
      const user = store.student_users.find(
        (u) => u.is_active && u.school_id.toLowerCase() === schoolId.toLowerCase() && u.email.toLowerCase() === emailValue
      );
      if (!user) {
        return res.status(404).json({ detail: { error: 'No active student account matched those details' } });
      }
      user.password_hash = pwHash;
      user.updated_at = new Date().toISOString();
      db.updateStudentPassword(user.student_id, pwHash, user.updated_at);
      return res.json({ ok: true, message: 'Password updated. You can sign in now.' });
    }

    if (role === 'instructor' || role === 'teacher') {
      const emailValue = normalizeEmail(payload.email || payload.username || '');
      if (!emailValue) return res.status(400).json({ detail: { error: 'Instructor email is required' } });
      const user = store.admin_users.find(
        (u) => u.is_active && u.role === 'instructor' && u.username.toLowerCase() === emailValue
      );
      if (!user) {
        return res.status(404).json({ detail: { error: 'No active instructor account matched that email' } });
      }
      user.password_hash = pwHash;
      user.updated_at = new Date().toISOString();
      db.updateAdminPassword(user.admin_id, pwHash, user.updated_at);
      return res.json({ ok: true, message: 'Password updated. You can sign in now.' });
    }

    return res.status(400).json({ detail: { error: 'Role must be student or instructor' } });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = currentAuthUser(req);
  res.json({ ok: Boolean(user), user });
});

app.post('/api/auth/logout', (req, res) => {
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const appToken = req.cookies?.[APP_COOKIE_NAME];
  const bearerToken = extractBearerToken(req);
  if (adminToken) revokedTokens.add(adminToken);
  if (appToken) revokedTokens.add(appToken);
  if (bearerToken) revokedTokens.add(bearerToken);
  clearAuthCookies(req, res);
  res.json({ ok: true });
});

app.get('/logout', (req, res) => {
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const appToken = req.cookies?.[APP_COOKIE_NAME];
  if (adminToken) revokedTokens.add(adminToken);
  if (appToken) revokedTokens.add(appToken);
  clearAuthCookies(req, res);
  res.type('html').send(renderLogoutRedirectHtml('/'));
});

app.post('/admin/logout', (req, res) => {
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const bearerToken = extractBearerToken(req);
  if (adminToken) revokedTokens.add(adminToken);
  if (bearerToken) revokedTokens.add(bearerToken);
  clearAuthCookies(req, res);
  res.json({ ok: true });
});

// Profile Routes
app.get('/api/profile', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;

  const builds = store.saved_builds
    .filter((b) => b.owner_role === user.role && b.owner_id === user.id)
    .sort((a, b) => b.build_id - a.build_id)
    .map((b) => decorateBuildRow(b, user));

  const favorites = store.build_favorites
    .filter((f) => f.user_role === user.role && f.user_id === user.id)
    .map((f) => store.saved_builds.find((b) => b.build_id === f.build_id))
    .filter(Boolean)
    .map((b) => decorateBuildRow(b, user));

  const scenarios =
    user.role === 'instructor'
      ? store.pc_scenarios
          .filter((s) => s.instructor_id === user.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(scenarioRowToPublic)
      : [];

  const badges = syncUserBadges(user);
  const scenarioCompletionCount = store.scenario_completions.filter(
    (c) => c.user_role === user.role && c.user_id === user.id
  ).length;

  res.json({
    user: {
      name: user.displayName || user.email || user.studentId || 'User',
      role: user.role,
      email: user.email,
      studentId: user.studentId,
      profileUrl: publicProfileUrl(user),
      avatar: 'U',
    },
    stats: {
      buildsPublished: builds.length,
      favoritesSaved: favorites.length,
      badgesEarned: badges.length,
      scenariosCompleted: scenarioCompletionCount,
      scenariosPublished: scenarios.filter((s) => s.isPublished).length,
    },
    builds,
    favorites,
    badges,
    scenarios,
    isOwnProfile: true,
  });
});

app.get('/api/profiles/:role/:profileId', (req, res) => {
  const target = getPublicProfile(req.params.role, req.params.profileId);
  if (!target) {
    return res.status(404).json({ detail: { error: 'Profile not found' } });
  }
  const builds = store.saved_builds
    .filter((b) => b.owner_role === target.role && b.owner_id === target.id && b.is_published !== false)
    .sort((a, b) => b.build_id - a.build_id)
    .map((b) => decorateBuildRow(b, null));

  const scenarios =
    target.role === 'instructor'
      ? store.pc_scenarios
          .filter((s) => s.instructor_id === target.id && s.is_published)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(scenarioRowToPublic)
      : [];

  res.json({
    user: {
      name: target.displayName || target.email || target.studentId || 'User',
      role: target.role,
      email: target.email,
      studentId: target.studentId,
      profileUrl: publicProfileUrl(target),
      avatar: 'U',
    },
    stats: {
      buildsPublished: builds.length,
      favoritesSaved: 0,
      badgesEarned: 0,
      scenariosPublished: scenarios.length,
    },
    builds,
    scenarios,
    isOwnProfile: false,
  });
});

// Scenarios
app.get('/api/scenarios', (req, res) => {
  const instructorId = req.query.instructor_id ? Number(req.query.instructor_id) : null;
  const rows = store.pc_scenarios
    .filter((s) => s.is_published && (instructorId === null || s.instructor_id === instructorId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(rows.map(scenarioRowToPublic));
});

function studentClassesPayload(studentId) {
  const instructors = new Map(store.admin_users.map((u) => [u.admin_id, u.display_name || u.username]));
  const enrollments = store.class_enrollments.filter((e) => e.student_id === studentId);
  const byClassId = new Map(store.classes.map((c) => [c.class_id, c]));

  return enrollments
    .map((enrollment) => {
      const cls = byClassId.get(enrollment.class_id);
      if (!cls) return null;
      const activityCount = store.activity_records.filter(
        (r) => r.student_id === studentId && r.class_id === cls.class_id
      ).length;
      return {
        id: cls.class_id,
        courseCode: cls.course_code,
        className: cls.class_name,
        section: cls.section,
        joinCode: cls.join_code,
        instructorName: instructors.get(cls.instructor_id) || 'Instructor',
        enrollmentStatus: enrollment.status,
        requestedAt: enrollment.requested_at,
        decidedAt: enrollment.decided_at,
        activityCount,
      };
    })
    .filter(Boolean);
}

app.get('/api/student/activities', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }

  const classById = new Map(store.classes.map((c) => [c.class_id, c]));
  const instructors = new Map(store.admin_users.map((u) => [u.admin_id, u.display_name || u.username]));
  const recordsByScenario = new Map(
    store.activity_records
      .filter((r) => r.student_id === user.id)
      .map((r) => [r.scenario_id, r])
  );
  const completions = new Map(
    store.scenario_completions
      .filter((completion) => completion.user_role === 'student' && completion.user_id === user.id)
      .map((completion) => [completion.scenario_id, completion])
  );

  const activities = store.pc_scenarios
    .filter((scenario) => scenario.is_published)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((scenario) => {
      const existingRecord = recordsByScenario.get(scenario.scenario_id);
      const fallbackCompletion = !existingRecord ? completions.get(scenario.scenario_id) : null;
      const record = existingRecord || (fallbackCompletion
        ? {
            scenario_id: scenario.scenario_id,
            student_id: user.id,
            class_id: 1,
            status: 'submitted',
            attempts_allowed: 1,
            attempts_used: 1,
            submitted_at: fallbackCompletion.completed_at,
          }
        : {
            scenario_id: scenario.scenario_id,
            student_id: user.id,
            class_id: 1,
            status: 'notStarted',
            attempts_allowed: 1,
            attempts_used: 0,
          });
      const cls = classById.get(record.class_id) || classById.get(1) || null;
      const instructorName = instructors.get(scenario.instructor_id) || 'Instructor';
      return sanitizeActivityForStudent(scenarioRowToPublic(scenario), record, cls, instructorName);
    });

  const classes = studentClassesPayload(user.id);
  const privacyRequests = store.privacy_requests
    .filter((p) => p.student_id === user.id)
    .map((p) => ({
      id: p.request_id,
      type: p.request_type,
      reason: p.reason,
      status: p.status,
      createdAt: p.created_at,
    }));

  res.json({
    activities,
    stats: computeStudentDashboardStats(activities),
    classes,
    privacyRequests,
    sessionTimeoutMinutes: 30,
  });
});

app.get('/api/student/classes', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }
  res.json({ classes: studentClassesPayload(user.id) });
});

app.post('/api/student/classes/join', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }

  const check = validateJoinCode(req.body?.joinCode || req.body?.code);
  if (!check.valid) {
    return res.status(400).json({ detail: { error: check.error } });
  }

  const targetClass = store.classes.find((c) => c.join_code.toUpperCase() === check.code);
  if (!targetClass) {
    return res.status(404).json({ detail: { error: `No class found matching join code "${check.code}". Check with your instructor.` } });
  }

  const existing = store.class_enrollments.find(
    (e) => e.class_id === targetClass.class_id && e.student_id === user.id
  );
  if (existing) {
    const label = existing.status === 'approved' ? 'already enrolled in' : 'already waiting for approval to join';
    return res.status(409).json({
      detail: { error: `You are ${label} ${targetClass.course_code} · ${targetClass.section}.` },
    });
  }

  const now = new Date().toISOString();
  const enrollmentStatus = targetClass.auto_approve ? 'approved' : 'pending';
  const saved = db.upsertEnrollment({
    class_id: targetClass.class_id,
    student_id: user.id,
    status: enrollmentStatus,
    requested_at: now,
    decided_at: enrollmentStatus === 'approved' ? now : null,
  });
  store.class_enrollments.push(saved);

  db.insertAuditLog({
    actor_role: 'student',
    actor_id: user.id,
    action: enrollmentStatus === 'approved' ? 'class_joined' : 'class_join_requested',
    target_type: 'class',
    target_id: String(targetClass.class_id),
    details: { joinCode: targetClass.join_code, status: enrollmentStatus },
    created_at: now,
  });

  res.status(201).json({
    ok: true,
    status: enrollmentStatus,
    message: enrollmentStatus === 'approved'
      ? `Joined ${targetClass.course_code} · ${targetClass.section}.`
      : `Join request sent for ${targetClass.course_code} · ${targetClass.section}. Waiting for instructor approval.`,
    classes: studentClassesPayload(user.id),
  });
});

app.post('/api/student/activities/:scenarioId/autosave', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }

  const scenarioId = Number(req.params.scenarioId);
  const scenario = store.pc_scenarios.find((s) => s.scenario_id === scenarioId && s.is_published);
  if (!scenario) {
    return res.status(404).json({ detail: { error: 'Assigned activity not found' } });
  }

  const existing = store.activity_records.find((r) => r.scenario_id === scenarioId && r.student_id === user.id);
  if (existing && (existing.status === 'submitted' || existing.status === 'released')) {
    return res.status(409).json({ detail: { error: 'This activity has already been submitted and is locked for instructor review.' } });
  }

  const now = new Date().toISOString();
  const saved = db.upsertActivityRecord({
    ...(existing || {}),
    scenario_id: scenarioId,
    student_id: user.id,
    class_id: existing?.class_id ?? 1,
    status: 'inProgress',
    attempts_allowed: existing?.attempts_allowed ?? 1,
    attempts_used: existing?.attempts_used ?? 0,
    last_saved_at: now,
    draft: req.body?.draft || null,
  });

  if (existing) Object.assign(existing, saved);
  else store.activity_records.push(saved);

  res.json({ ok: true, status: saved.status, lastSavedAt: saved.last_saved_at });
});

app.post('/api/student/activities/:scenarioId/submit', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }

  const scenarioId = Number(req.params.scenarioId);
  const scenario = store.pc_scenarios.find((s) => s.scenario_id === scenarioId && s.is_published);
  if (!scenario) {
    return res.status(404).json({ detail: { error: 'Assigned activity not found' } });
  }

  const existing = store.activity_records.find((r) => r.scenario_id === scenarioId && r.student_id === user.id);
  // SR-07 & FR-05: Idempotent single-submission protection
  if (existing && (existing.status === 'submitted' || existing.status === 'released')) {
    return res.json({
      ok: true,
      alreadySubmitted: true,
      status: existing.status,
      submittedAt: existing.submitted_at,
      message: 'Your submission was already recorded and is awaiting instructor review.',
    });
  }

  if (existing && !canStudentStartActivity({ status: existing.status, attemptsAllowed: existing.attempts_allowed, attemptsUsed: existing.attempts_used })) {
    return res.status(409).json({ detail: { error: 'No submission attempts remaining. Ask your instructor to reopen this activity.' } });
  }

  const now = new Date().toISOString();
  const proposedScoreRaw = req.body?.score;
  const proposedScore = proposedScoreRaw !== undefined && proposedScoreRaw !== null && proposedScoreRaw !== '' ? Number(proposedScoreRaw) : null;
  const proposedVerdict = cleanText(req.body?.compatibilityVerdict) || 'Pending check';
  const issues = Array.isArray(req.body?.issues) ? req.body.issues.map((i) => cleanText(i)).filter(Boolean) : [];

  const saved = db.upsertActivityRecord({
    ...(existing || {}),
    scenario_id: scenarioId,
    student_id: user.id,
    class_id: existing?.class_id ?? 1,
    status: 'submitted',
    attempts_allowed: existing?.attempts_allowed ?? 1,
    attempts_used: (existing?.attempts_used ?? 0) + 1,
    last_saved_at: now,
    submitted_at: now,
    compatibility_verdict: proposedVerdict,
    proposed_score: proposedScore,
    final_score: null,
    issues,
    instructor_feedback: '',
    reviewed_by_name: '',
    released_at: null,
    draft: req.body?.draft || existing?.draft || null,
  });

  if (existing) Object.assign(existing, saved);
  else store.activity_records.push(saved);

  db.insertAuditLog({
    actor_role: 'student',
    actor_id: user.id,
    action: 'activity_submitted',
    target_type: 'scenario',
    target_id: String(scenarioId),
    details: { attemptsUsed: saved.attempts_used },
    created_at: now,
  });

  // FR-15: Do NOT return proposed score or compatibility verdict to student
  res.json({
    ok: true,
    status: 'submitted',
    submittedAt: saved.submitted_at,
    message: 'Activity submitted. Your evaluation and feedback will appear once your instructor releases them.',
  });
});

// SEC-08: Students cannot modify or delete stored evaluations
app.all('/api/student/activities/:scenarioId/evaluation', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  return res.status(403).json({
    detail: { error: 'Stored evaluations are read-only and can only be confirmed or released by an instructor.' },
  });
});

// SEC-11: RA 10173 Data Privacy personal data erasure request
app.post('/api/student/privacy/erasure-request', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  if (user.role !== 'student') {
    return res.status(403).json({ detail: { error: 'Student access required' } });
  }

  const reason = cleanText(req.body?.reason || '').slice(0, 300);
  const now = new Date().toISOString();
  const saved = db.insertPrivacyRequest({
    student_id: user.id,
    request_type: 'erasure',
    reason: reason || 'Student personal data erasure request under RA 10173',
    status: 'recorded',
    created_at: now,
  });
  store.privacy_requests.unshift(saved);

  db.insertAuditLog({
    actor_role: 'student',
    actor_id: user.id,
    action: 'privacy_erasure_requested',
    target_type: 'student',
    target_id: String(user.id),
    details: { requestId: saved.request_id },
    created_at: now,
  });

  res.status(201).json({
    ok: true,
    request: {
      id: saved.request_id,
      type: saved.request_type,
      reason: saved.reason,
      status: saved.status,
      createdAt: saved.created_at,
    },
    message: 'Your RA 10173 data erasure request has been logged for review, subject to institutional academic and audit record retention.',
  });
});

app.get('/api/scenarios/:scenarioId', (req, res) => {
  const id = Number(req.params.scenarioId);
  const row = store.pc_scenarios.find((s) => s.scenario_id === id && s.is_published);
  if (!row) return res.status(404).json({ detail: { error: 'Scenario not found' } });
  res.json(scenarioRowToPublic(row));
});

app.post('/api/scenarios', (req, res) => {
  const user = requireInstructor(req, res);
  if (!user) return;
  const payload = req.body || {};
  const title = cleanText(payload.title || payload.name);
  if (!title) return res.status(400).json({ detail: { error: 'Scenario title is required' } });

  const now = new Date().toISOString();
  const row = db.insertScenario({
    instructor_id: user.id,
    title,
    description: cleanText(payload.description || payload.desc),
    activity_type: cleanText(payload.activityType || payload.activity_type || payload.type) || 'build',
    tier: cleanText(payload.tier),
    budget: payload.budget !== undefined && payload.budget !== null && payload.budget !== '' ? Number(payload.budget) : null,
    time_limit_minutes: payload.timeLimitMinutes ?? payload.time_limit_minutes ?? null,
    objectives: Array.isArray(payload.objectives) ? payload.objectives : [],
    troubleshooting: Array.isArray(payload.troubleshooting) ? payload.troubleshooting : [],
    constraints: typeof payload.constraints === 'object' && payload.constraints !== null ? payload.constraints : {},
    is_published: payload.isPublished !== undefined ? Boolean(payload.isPublished) : true,
    created_at: now,
    updated_at: now,
  });
  store.pc_scenarios.push(row);
  res.json({ ok: true, scenario: scenarioRowToPublic(row) });
});

app.post('/api/scenarios/:scenarioId/complete', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  const scenarioId = Number(req.params.scenarioId);
  const scoreRaw = req.body?.score;
  const score = scoreRaw !== undefined && scoreRaw !== null && scoreRaw !== '' ? Number(scoreRaw) : null;
  const existing = store.scenario_completions.find(
    (c) => c.scenario_id === scenarioId && c.user_role === user.role && c.user_id === user.id
  );
  const now = new Date().toISOString();
  const saved = db.upsertScenarioCompletion({
    scenario_id: scenarioId,
    user_role: user.role,
    user_id: user.id,
    score,
    completed_at: now,
  });
  if (existing) {
    existing.score = saved.score;
    existing.completed_at = saved.completed_at;
  } else {
    store.scenario_completions.push(saved);
  }
  const badges = syncUserBadges(user);
  res.json({ ok: true, badges });
});

// Search
app.get('/api/search', (req, res) => {
  const query = cleanText(req.query.q || '');
  if (query.length < 2) return res.json({ query, results: [] });
  const terms = searchTerms(query);
  const results = [];

  for (const b of [...store.saved_builds].sort((a, b) => b.build_id - a.build_id)) {
    if (b.is_published && matchesQuery([b.build_name], query, terms)) {
      results.push({ type: 'build', id: b.build_id, title: b.build_name, subtitle: 'Published PC build', url: `/simulator?build=${b.build_id}&readonly=1` });
    }
  }

  for (const s of store.pc_scenarios) {
    if (!s.is_published) continue;
    const inst = store.admin_users.find((a) => a.admin_id === s.instructor_id);
    if (matchesQuery([s.title, s.description, inst?.display_name], query, terms)) {
      results.push({
        type: 'scenario',
        id: s.scenario_id,
        title: s.title,
        subtitle: `Scenario by ${inst?.display_name || 'Instructor'}`,
        url: `/profiles/instructor/${s.instructor_id}`,
      });
    }
  }

  for (const a of store.admin_users) {
    if (a.role === 'instructor' && a.is_active && matchesQuery([a.username, a.username.split('@')[0], a.display_name], query, terms)) {
      results.push({
        type: 'profile',
        id: `instructor-${a.admin_id}`,
        title: a.display_name || a.username,
        subtitle: 'Instructor profile',
        url: `/profiles/instructor/${a.admin_id}`,
      });
    }
  }

  for (const s of store.student_users) {
    if (
      s.is_active &&
      matchesQuery([s.school_id, s.email, s.display_name, s.first_name, s.last_name, `${s.first_name} ${s.last_name}`], query, terms)
    ) {
      results.push({
        type: 'profile',
        id: `student-${s.student_id}`,
        title: s.display_name || s.school_id,
        subtitle: 'Student profile',
        url: `/profiles/student/${s.student_id}`,
      });
    }
  }

  res.json({ query, results: results.slice(0, 20) });
});

// Components & Compatibility
app.get('/api/components', (_req, res) => {
  res.json(fetchAllComponentsGrouped());
});

app.get('/api/components/:category', (req, res) => {
  const norm = normalizeCategory(req.params.category);
  if (norm === 'all') return res.json(fetchAllComponentsGrouped());
  if (!norm) return res.status(400).json({ detail: { error: 'Invalid category' } });
  return res.json(fetchComponentsByCategory(norm));
});

app.get('/api/components/:category/:componentId', (req, res) => {
  const comp = fetchComponent(req.params.category, req.params.componentId);
  if (!comp) return res.status(404).json({ detail: { error: 'Component not found' } });
  return res.json(comp);
});

app.post('/api/compatibility', (req, res) => {
  const report = buildReport(req.body || {}, fetchComponent);
  res.json({
    compatible: report.compatible,
    issues: report.issues,
    totalPower: report.totalPower,
    recommendedPsu: report.recommendedPsu,
    score: report.score,
  });
});

app.post('/api/stats', (req, res) => {
  res.json(buildReport(req.body || {}, fetchComponent));
});

// Builds
app.get('/api/builds', (req, res) => {
  let user = currentAuthUser(req);
  const scope = cleanText(req.query.scope || '').toLowerCase();
  let rows = store.saved_builds;

  if (['mine', 'my', 'owned'].includes(scope)) {
    user = requireLoggedIn(req, res);
    if (!user) return;
    rows = rows.filter((b) => b.owner_role === user.role && b.owner_id === user.id);
  } else {
    rows = rows.filter((b) => b.is_published !== false);
  }

  const sorted = [...rows].sort((a, b) => b.build_id - a.build_id);
  res.json(sorted.map((b) => decorateBuildRow(b, user)));
});

app.post('/api/builds', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  const data = req.body || {};
  const buildName = cleanText(data.buildName || data.build_name || data.name) || 'Untitled Build';
  const dataToSave = { ...data, stats: buildReport(data, fetchComponent) };
  const componentsStr = JSON.stringify(dataToSave.components || {});
  const cablesStr = JSON.stringify(dataToSave.connectedCables || {});
  const now = new Date().toISOString();

  const existing = store.saved_builds.find(
    (b) =>
      b.owner_role === user.role &&
      b.owner_id === user.id &&
      JSON.stringify(b.build_data?.components || {}) === componentsStr &&
      JSON.stringify(b.build_data?.connectedCables || {}) === cablesStr
  );

  if (existing) {
    existing.build_name = buildName;
    existing.build_data = dataToSave;
    existing.updated_at = now;
    db.updateBuild(existing);
    syncUserBadges(user);
    return res.json({ success: true, id: existing.build_id, deduped: true });
  }

  const created = db.insertBuild({
    build_name: buildName,
    build_data: dataToSave,
    owner_role: user.role,
    owner_id: user.id,
    is_published: true,
    created_at: now,
    updated_at: now,
  });
  store.saved_builds.push(created);
  syncUserBadges(user);
  return res.json({ success: true, id: created.build_id });
});

app.get('/api/builds/:buildId', (req, res) => {
  const id = Number(req.params.buildId);
  const row = store.saved_builds.find((b) => b.build_id === id && b.is_published !== false);
  if (!row) return res.status(404).json({ detail: { error: 'Build not found' } });
  return res.json(decorateBuildRow(row, currentAuthUser(req)));
});

app.post('/api/builds/:buildId/heart', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  const buildId = Number(req.params.buildId);
  const idx = store.build_hearts.findIndex(
    (h) => h.build_id === buildId && h.user_role === user.role && h.user_id === user.id
  );
  let hearted;
  if (idx >= 0) {
    store.build_hearts.splice(idx, 1);
    db.deleteHeart(buildId, user.role, user.id);
    hearted = false;
  } else {
    const inserted = db.insertHeart({
      build_id: buildId,
      user_role: user.role,
      user_id: user.id,
      created_at: new Date().toISOString(),
    });
    store.build_hearts.push(inserted);
    hearted = true;
  }
  const heartCount = store.build_hearts.filter((h) => h.build_id === buildId).length;
  res.json({ ok: true, hearted, heartCount });
});

app.post('/api/builds/:buildId/favorite', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  const buildId = Number(req.params.buildId);
  const idx = store.build_favorites.findIndex(
    (f) => f.build_id === buildId && f.user_role === user.role && f.user_id === user.id
  );
  let favorited;
  if (idx >= 0) {
    store.build_favorites.splice(idx, 1);
    db.deleteFavorite(buildId, user.role, user.id);
    favorited = false;
  } else {
    const inserted = db.insertFavorite({
      build_id: buildId,
      user_role: user.role,
      user_id: user.id,
      created_at: new Date().toISOString(),
    });
    store.build_favorites.push(inserted);
    favorited = true;
  }
  const favoriteCount = store.build_favorites.filter((f) => f.build_id === buildId).length;
  res.json({ ok: true, favorited, favoriteCount });
});

app.delete('/api/builds/:buildId', (req, res) => {
  const user = requireLoggedIn(req, res);
  if (!user) return;
  const buildId = Number(req.params.buildId);
  const idx = store.saved_builds.findIndex(
    (b) => b.build_id === buildId && ((b.owner_role === user.role && b.owner_id === user.id) || user.role === 'admin')
  );
  if (idx < 0) return res.status(404).json({ detail: { error: 'Build not found' } });
  store.saved_builds.splice(idx, 1);
  store.build_hearts = store.build_hearts.filter((h) => h.build_id !== buildId);
  store.build_favorites = store.build_favorites.filter((f) => f.build_id !== buildId);
  db.deleteBuild(buildId);
  res.json({ success: true });
});

// Admin Routes
app.get('/api/admin/schemas', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(ADMIN_SCHEMAS);
});

app.get('/api/admin/categories', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(CATEGORY_INFO);
});

app.get('/api/admin/metrics', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const students = store.student_users.length;
  const instructors = store.admin_users.filter((u) => u.role === 'instructor').length;
  const admins = store.admin_users.filter((u) => u.role === 'admin').length;
  const recentStudents = store.student_users.filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= weekAgo).length;
  const recentStaff = store.admin_users.filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= weekAgo).length;
  const publishedBuilds = store.saved_builds.filter((b) => b.is_published).length;
  const publishedScenarios = store.pc_scenarios.filter((s) => s.is_published).length;

  res.json({
    usersRegistered: students + instructors + admins,
    students,
    instructors,
    admins,
    recentLogins: recentStudents + recentStaff,
    publishedBuilds,
    publishedScenarios,
    publishedTotal: publishedBuilds + publishedScenarios,
  });
});

app.get('/api/admin/users/overview', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = [
    ...store.student_users.map((s) => ({
      type: 'student',
      id: s.student_id,
      identifier: s.school_id,
      name: s.display_name,
      email: s.email,
      is_active: s.is_active,
      last_login_at: s.last_login_at,
      created_at: s.created_at,
    })),
    ...store.admin_users.map((a) => ({
      type: a.role,
      id: a.admin_id,
      identifier: a.username,
      name: a.display_name,
      email: a.username,
      is_active: a.is_active,
      last_login_at: a.last_login_at,
      created_at: a.created_at,
    })),
  ];
  res.json(rows);
});

app.get('/api/admin/activity/recent-logins', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = [
    ...store.student_users
      .filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= weekAgo)
      .map((s) => ({
        type: 'student',
        id: s.student_id,
        identifier: s.school_id,
        name: s.display_name,
        email: s.email,
        last_login_at: s.last_login_at,
      })),
    ...store.admin_users
      .filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= weekAgo)
      .map((a) => ({
        type: a.role,
        id: a.admin_id,
        identifier: a.username,
        name: a.display_name,
        email: a.username,
        last_login_at: a.last_login_at,
      })),
  ].sort((a, b) => b.last_login_at.localeCompare(a.last_login_at));
  res.json(recent);
});

app.get('/api/admin/published', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const published = [
    ...store.saved_builds
      .filter((b) => b.is_published)
      .map((b) => ({
        type: 'build',
        id: b.build_id,
        title: b.build_name,
        owner_role: b.owner_role,
        owner: getCreatorInfo(b.owner_role, b.owner_id).creator_name,
        created_at: b.created_at,
      })),
    ...store.pc_scenarios
      .filter((s) => s.is_published)
      .map((s) => ({
        type: 'scenario',
        id: s.scenario_id,
        title: s.title,
        owner_role: 'instructor',
        owner: getCreatorInfo('instructor', s.instructor_id).creator_name,
        created_at: s.created_at,
      })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(published);
});

app.get('/api/admin/components', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(store.components);
});

app.get('/api/admin/components/:category', (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (String(req.params.category).toLowerCase().trim() === 'all') {
    return res.json(store.components);
  }
  const norm = normalizeAdminCategory(req.params.category);
  if (!norm || !ADMIN_TABLES[norm]) return res.status(400).json({ detail: { error: 'Invalid category' } });
  res.json(store.components[norm] || []);
});

function validateAdminPayload(category, payload) {
  if (!ADMIN_SCHEMAS[category]) {
    const err = new Error('Invalid admin category');
    err.status = 400;
    throw err;
  }
  const cleaned = {};
  for (const field of ADMIN_SCHEMAS[category].fields) {
    cleaned[field] = String(payload[field] ?? '').trim();
  }
  if (!cleaned.brand || !cleaned.model) {
    const err = new Error('Brand and Model are required');
    err.status = 400;
    throw err;
  }
  return cleaned;
}

app.post('/api/admin/components/:category', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const norm = normalizeAdminCategory(req.params.category) || req.params.category;
    const data = validateAdminPayload(norm, req.body || {});
    const row = { id: store.nextIds[norm]++, ...data };
    store.components[norm].push(row);
    db.upsertComponent(norm, row);
    res.json(row);
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/admin/components/:category/:componentId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const norm = normalizeAdminCategory(req.params.category) || req.params.category;
    const id = extractNumericId(req.params.componentId);
    if (!id) return res.status(400).json({ detail: { error: 'Invalid component id' } });
    const data = validateAdminPayload(norm, req.body || {});
    const list = store.components[norm] || [];
    const idx = list.findIndex((c) => Number(c.id) === id);
    if (idx < 0) return res.status(404).json({ detail: { error: 'Component not found' } });
    list[idx] = { id, ...data };
    db.upsertComponent(norm, list[idx]);
    res.json(list[idx]);
  } catch (err) {
    sendError(res, err);
  }
});

app.patch('/api/admin/components/:category/:componentId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const norm = normalizeAdminCategory(req.params.category) || req.params.category;
    const id = extractNumericId(req.params.componentId);
    if (!id) return res.status(400).json({ detail: { error: 'Invalid component id' } });
    const list = store.components[norm] || [];
    const idx = list.findIndex((c) => Number(c.id) === id);
    if (idx < 0) return res.status(404).json({ detail: { error: 'Component not found' } });
    const merged = { ...list[idx], ...(req.body || {}) };
    const data = validateAdminPayload(norm, merged);
    list[idx] = { id, ...data };
    db.upsertComponent(norm, list[idx]);
    res.json(list[idx]);
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/admin/components/:category/:componentId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const norm = normalizeAdminCategory(req.params.category) || req.params.category;
  if (!ADMIN_TABLES[norm]) return res.status(400).json({ detail: { error: 'Invalid admin category' } });
  const id = extractNumericId(req.params.componentId);
  if (!id) return res.status(400).json({ detail: { error: 'Invalid component id' } });
  const list = store.components[norm] || [];
  const idx = list.findIndex((c) => Number(c.id) === id);
  if (idx < 0) return res.status(404).json({ detail: { error: 'Component not found' } });
  list.splice(idx, 1);
  db.deleteComponent(norm, id);
  res.json({ success: true, id });
});

app.get('/api/admin/users/students', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(
    store.student_users.map((s) => ({
      student_id: s.student_id,
      school_id: s.school_id,
      email: s.email,
      first_name: s.first_name,
      last_name: s.last_name,
      display_name: s.display_name,
      is_active: s.is_active,
      last_login_at: s.last_login_at,
      created_at: s.created_at,
    }))
  );
});

app.get('/api/admin/users/instructors', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(
    store.admin_users
      .filter((u) => u.role === 'instructor')
      .map((a) => ({
        admin_id: a.admin_id,
        username: a.username,
        display_name: a.display_name,
        role: a.role,
        is_active: a.is_active,
        last_login_at: a.last_login_at,
        created_at: a.created_at,
      }))
  );
});

app.post('/api/admin/users/students', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(createStudentUser(req.body || {}));
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/users/instructors', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(createInstructorUser(req.body || {}));
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/admin/users', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body || {};
  const username = cleanText(payload.username);
  const password = String(payload.password || '');
  const displayName = cleanText(payload.display_name || payload.displayName || username);
  if (!username || !password) {
    return res.status(400).json({ detail: { error: 'Username and password are required' } });
  }
  if (store.admin_users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ detail: { error: 'Could not create admin user: username already exists' } });
  }
  const now = new Date().toISOString();
  const user = db.insertAdminUser({
    username,
    password_hash: bcrypt.hashSync(password, 10),
    display_name: displayName,
    role: 'admin',
    is_active: true,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });
  store.admin_users.push(user);
  res.json({
    admin_id: user.admin_id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
  });
});

app.delete('/api/admin/users/students/:studentId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.studentId);
  const idx = store.student_users.findIndex((u) => u.student_id === id);
  if (idx < 0) return res.status(404).json({ detail: { error: 'Student account not found' } });
  store.student_users.splice(idx, 1);
  store.saved_builds = store.saved_builds.filter((b) => !(b.owner_role === 'student' && b.owner_id === id));
  store.build_favorites = store.build_favorites.filter((f) => !(f.user_role === 'student' && f.user_id === id));
  store.build_hearts = store.build_hearts.filter((h) => !(h.user_role === 'student' && h.user_id === id));
  store.user_badges = store.user_badges.filter((b) => !(b.user_role === 'student' && b.user_id === id));
  store.scenario_completions = store.scenario_completions.filter((c) => !(c.user_role === 'student' && c.user_id === id));
  db.deleteStudentCascade(id);
  res.json({ ok: true, deleted: true, userType: 'students', id });
});

app.delete('/api/admin/users/instructors/:instructorId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.instructorId);
  const idx = store.admin_users.findIndex((u) => u.admin_id === id && u.role === 'instructor');
  if (idx < 0) return res.status(404).json({ detail: { error: 'Instructor account not found' } });
  store.admin_users.splice(idx, 1);
  store.pc_scenarios = store.pc_scenarios.filter((s) => s.instructor_id !== id);
  store.saved_builds = store.saved_builds.filter((b) => !(b.owner_role === 'instructor' && b.owner_id === id));
  store.build_favorites = store.build_favorites.filter((f) => !(f.user_role === 'instructor' && f.user_id === id));
  store.build_hearts = store.build_hearts.filter((h) => !(h.user_role === 'instructor' && h.user_id === id));
  store.user_badges = store.user_badges.filter((b) => !(b.user_role === 'instructor' && b.user_id === id));
  store.scenario_completions = store.scenario_completions.filter((c) => !(c.user_role === 'instructor' && c.user_id === id));
  db.deleteInstructorCascade(id);
  res.json({ ok: true, deleted: true, userType: 'instructors', id });
});

// Unmatched API 404
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================================
// TEMPLATE & PAGE ROUTES (ORIG HTML MULTI-PAGE FRONTEND)
// ============================================================

const TEMPLATES_DIR = path.join(__dirname, 'frontend', 'templates');

const IFRAME_TOKEN_BRIDGE_SCRIPT = `<script>
(function(){
  const KEY = 'assembly_pc_token';
  function getToken(){
    try {
      return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || window.__assemblyToken || '';
    } catch {
      return window.__assemblyToken || '';
    }
  }
  function setToken(t){
    window.__assemblyToken = t || '';
    try {
      if (t) { sessionStorage.setItem(KEY, t); localStorage.setItem(KEY, t); }
      else { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }
    } catch {}
  }
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const isApi = url.startsWith('/api/') || url.includes('/api/');
      const nextInit = init ? { ...init } : {};
      if (isApi) {
        const token = getToken();
        if (token) {
          const headers = new Headers(nextInit.headers || (typeof input !== 'string' && input && input.headers) || undefined);
          if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
          nextInit.headers = headers;
        }
      }
      const res = await origFetch(input, nextInit);
      if (url.includes('/api/auth/login') || url.includes('/api/auth/register')) {
        try {
          const cloned = res.clone();
          const data = await cloned.json();
          if (data && data.token) setToken(data.token);
        } catch {}
      } else if (url.includes('/api/auth/logout') || url.includes('/admin/logout')) {
        setToken('');
      }
      return res;
    };
  }
})();
</script>`;

function renderLogoutRedirectHtml(target = '/') {
  const safeTarget = escapeHtmlAttr(target);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Signing out...</title>
<script>
(function(){
  try {
    ['assembly_pc_token','userRole','userName','studentId','userEmail'].forEach(function(k){
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    });
  } catch (e) {}
  window.location.replace(${JSON.stringify(target)});
})();
</script>
</head><body style="background:#0d1b2e;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">Signing out... <noscript><a href="${safeTarget}">Continue</a></noscript></body></html>`;
}

function renderTokenGateHtml(fallbackUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Assembly PC</title>
<script>
(async function(){
  var token = '';
  try { token = sessionStorage.getItem('assembly_pc_token') || localStorage.getItem('assembly_pc_token') || ''; } catch (e) {}
  if (!token) { window.location.replace(${JSON.stringify(fallbackUrl)}); return; }
  try {
    var res = await fetch(window.location.pathname + window.location.search, {
      headers: { 'Authorization': 'Bearer ' + token, 'X-Assembly-Auth-Gate': '1' },
      credentials: 'same-origin'
    });
    var ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('text/html') && !res.headers.get('x-assembly-gate')) {
      var html = await res.text();
      document.open();
      document.write(html);
      document.close();
      return;
    }
  } catch (e) {}
  try {
    sessionStorage.removeItem('assembly_pc_token');
    localStorage.removeItem('assembly_pc_token');
  } catch (e) {}
  window.location.replace(${JSON.stringify(fallbackUrl)});
})();
</script>
</head>
<body style="background:#0d1b2e;color:#94a3b8;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">Loading workspace...</body>
</html>`;
}

const FIREBASE_CLIENT_BOOTSTRAP = `<script type="importmap">
{
  "imports": {
    "firebase/app": "/vendor/firebase/firebase-app.js",
    "firebase/auth": "/vendor/firebase/firebase-auth.js",
    "firebase/firestore": "/vendor/firebase/firebase-firestore.js",
    "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js": "/vendor/firebase/firebase-app.js",
    "three": "/vendor/three/three.module.js",
    "three/addons/": "/vendor/three/addons/"
  }
}
</script>
<script type="module" src="/static/js/firebase-client.mjs"></script>`;

function readAndProcessTemplate(templateName) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templatePath)) {
    return null;
  }
  let content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace(/\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}/g, '/static/$1');
  content = content.replace(/\{\{\s*url_for\("static",\s*filename="([^"]+)"\)\s*\}\}/g, '/static/$1');
  if (content.includes('</head>')) {
    if (!content.includes('rel="icon"') && !content.includes("rel='icon'")) {
      content = content.replace('</head>', '<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>\n</head>');
    }
    content = content.replace('</head>', `${IFRAME_TOKEN_BRIDGE_SCRIPT}\n${FIREBASE_CLIENT_BOOTSTRAP}\n</head>`);
  }
  return content;
}

function escapeHtmlAttr(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeAdminBackUrl(rawBack) {
  const val = String(rawBack || '').trim();
  if (!val) return '/';
  if (val.startsWith('/') && !val.startsWith('//') && !val.startsWith('/admin')) {
    return val;
  }
  try {
    const parsed = new URL(val, 'http://localhost');
    if (parsed.pathname && !parsed.pathname.startsWith('/admin')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {}
  return '/';
}

function adminBackFromRequest(req) {
  return safeAdminBackUrl(req.query.back || req.query.next || req.headers.referer);
}

function adminLoginUrl(backUrl = '/') {
  return `/admin/login?back=${encodeURIComponent(safeAdminBackUrl(backUrl))}`;
}

function verifyAdminSession(req) {
  const adminData = verifyToken(req.cookies?.[ADMIN_COOKIE_NAME]);
  if (adminData) {
    const found = store.admin_users.find((u) => u.is_active && u.username === adminData.username && u.role === 'admin');
    if (found) return found.username;
  }
  const user = currentAuthUser(req);
  if (user && user.role === 'admin') return user.email;
  return null;
}

function renderAdminLogin(error = '', backUrl = '/') {
  const safeBack = safeAdminBackUrl(backUrl);
  const errorHtml = error ? `<div class="error">${escapeHtmlAttr(error)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AssemblyPC Admin Login</title>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1b2e;font-family:Inter,sans-serif;color:#0f172a;padding:24px}
.login{width:min(380px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
.brand{font-family:Sora,sans-serif;font-size:22px;font-weight:800;color:#0d1b2e;margin-bottom:4px}
.brand span{color:#3ecf5e}
.sub{font-size:13px;color:#64748b;margin-bottom:22px}
label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#334155;margin:12px 0 5px}
input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;font-size:14px;font-family:Inter,sans-serif;outline:none}
input:focus{border-color:#3ecf5e;box-shadow:0 0 0 3px rgba(62,207,94,.14)}
button{width:100%;margin-top:18px;border:none;border-radius:8px;padding:11px 14px;background:#3ecf5e;color:#fff;font-weight:800;font-family:Sora,sans-serif;cursor:pointer}
button:hover{background:#28a745}
.back{display:inline-flex;align-items:center;gap:6px;color:#334155;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:18px}
.back:hover{color:#3ecf5e}
.error{padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;font-size:12px;margin-bottom:12px}
.hint{font-size:11px;color:#94a3b8;margin-top:14px;line-height:1.5}
</style>
</head>
<body>
<form class="login" id="adminLoginForm" method="post" action="${escapeHtmlAttr(adminLoginUrl(safeBack))}">
  <a class="back" href="${escapeHtmlAttr(safeBack)}">&larr; Back</a>
  <div class="brand">Assembly<span>PC</span></div>
  <div class="sub">Admin access required</div>
  ${errorHtml}
  <div id="adminJsError" class="error" style="display:none"></div>
  <label for="username">Username</label>
  <input id="username" name="username" autocomplete="username" required/>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required/>
  <button type="submit" id="adminSubmitBtn">Sign In to Admin</button>
  <div class="hint">Shortcut: Press Shift+A+D from any page to open Admin Login.</div>
</form>
<script>
(function(){
  var form = document.getElementById('adminLoginForm');
  var errEl = document.getElementById('adminJsError');
  var btn = document.getElementById('adminSubmitBtn');
  if (!form || typeof window.fetch !== 'function') return;
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          role: 'admin',
          username: document.getElementById('username').value.trim(),
          password: document.getElementById('password').value
        })
      });
      var data = await res.json().catch(function(){ return null; });
      if (!res.ok) {
        var msg = (data && data.detail && data.detail.error) || (data && data.error) || 'Invalid username or password.';
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        return;
      }
      if (data && data.token) {
        try {
          sessionStorage.setItem('assembly_pc_token', data.token);
          localStorage.setItem('assembly_pc_token', data.token);
        } catch (err) {}
      }
      window.location.href = (data && data.redirectUrl) || '/admin';
    } catch (err) {
      form.submit();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In to Admin'; }
    }
  });
})();
</script>
</body>
</html>`;
}

const staticDir = path.join(__dirname, 'frontend', 'static');
if (fs.existsSync(staticDir)) {
  app.use('/static', express.static(staticDir));
}
const studentAppDir = path.join(staticDir, 'student-app');
app.use('/student-assets', express.static(studentAppDir));

app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build')));

app.get('/vendor/firebase/:file', (req, res) => {
  const allowed = new Set(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']);
  const file = path.basename(String(req.params.file || ''));
  if (!allowed.has(file)) return res.status(404).end();
  const target = path.join(__dirname, 'node_modules', 'firebase', file);
  if (!fs.existsSync(target)) return res.status(404).end();
  return res.type('application/javascript').sendFile(target);
});

app.get('/firebase-applet-config.json', (_req, res) => {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) return res.status(404).json({ error: 'Not configured' });
  return res.type('application/json').sendFile(configPath);
});

app.get('/', (_req, res) => {
  const html = readAndProcessTemplate('homepage.html');
  if (!html) return res.status(500).send('<h1>Assembly PC</h1><p>Homepage template not found.</p>');
  res.type('html').send(html);
});

app.get(['/student', '/student/dashboard'], (_req, res) => {
  const studentAppIndex = path.join(studentAppDir, 'index.html');
  if (!fs.existsSync(studentAppIndex)) {
    return res.status(503).send('Student dashboard is not built. Run npm run build first.');
  }
  let html = fs.readFileSync(studentAppIndex, 'utf-8');
  if (html.includes('</head>')) {
    if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
      html = html.replace('</head>', '<link rel="icon" type="image/svg+xml" href="/static/favicon.svg"/>\n</head>');
    }
    html = html.replace('</head>', `${IFRAME_TOKEN_BRIDGE_SCRIPT}\n</head>`);
  }
  return res.type('html').send(html);
});

app.get('/simulator', (req, res) => {
  const user = currentAuthUser(req);
  const readonlyBuildId = req.query.build;
  const readonlyView = Boolean(readonlyBuildId) && ['1', 'true', 'yes'].includes(String(req.query.readonly || '').toLowerCase());
  if (!user && !readonlyView) {
    if (req.headers['x-assembly-auth-gate']) {
      return res.status(401).send('Login required');
    }
    res.set('x-assembly-gate', '1');
    return res.type('html').send(renderTokenGateHtml('/?login_required=simulator'));
  }
  let content = readAndProcessTemplate('simulation.html');
  if (!content) return res.status(500).send('Simulation template not found.');
  if (user) {
    const authScript = `<script>window.AUTH_USER = ${JSON.stringify(user)};try{sessionStorage.setItem('userRole', window.AUTH_USER.role);sessionStorage.setItem('userName', window.AUTH_USER.displayName || window.AUTH_USER.email || window.AUTH_USER.studentId || 'User');if(window.AUTH_USER.studentId)sessionStorage.setItem('studentId', window.AUTH_USER.studentId);if(window.AUTH_USER.email)sessionStorage.setItem('userEmail', window.AUTH_USER.email);}catch(err){}</script>`;
    content = content.replace('</head>', `${authScript}\n</head>`);
  }
  return res.type('html').send(content);
});

app.get('/admin/login', (req, res) => {
  if (verifyAdminSession(req)) {
    return res.redirect(303, '/admin');
  }
  res.type('html').send(renderAdminLogin('', adminBackFromRequest(req)));
});

app.post('/admin/login', (req, res) => {
  const backUrl = adminBackFromRequest(req);
  const username = cleanText(req.body?.username || '');
  const password = String(req.body?.password || '');

  if (checkAccountLockout(username)) {
    return res.status(429).type('html').send(renderAdminLogin('Account locked due to too many failed login attempts. Try again later.', backUrl));
  }
  const user = store.admin_users.find((u) => u.is_active && u.username === username && u.role === 'admin');
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginAttempt(username, false);
    return res.status(401).type('html').send(renderAdminLogin('Invalid username or password.', backUrl));
  }
  recordLoginAttempt(username, true);
  user.last_login_at = new Date().toISOString();
  db.updateAdminLogin(user.admin_id, user.last_login_at);
  setAppSessionCookie(req, res, 'admin', user.username, true);
  setAdminSessionCookie(req, res, user.username);
  return res.redirect(303, '/admin');
});

app.get('/admin/logout', (req, res) => {
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const appToken = req.cookies?.[APP_COOKIE_NAME];
  if (adminToken) revokedTokens.add(adminToken);
  if (appToken) revokedTokens.add(appToken);
  clearAuthCookies(req, res);
  res.type('html').send(renderLogoutRedirectHtml('/'));
});

app.get('/admin', (req, res) => {
  if (!verifyAdminSession(req)) {
    if (req.headers['x-assembly-auth-gate']) {
      return res.status(401).send('Admin login required');
    }
    res.set('x-assembly-gate', '1');
    return res.type('html').send(renderTokenGateHtml(adminLoginUrl(adminBackFromRequest(req))));
  }
  const html = readAndProcessTemplate('admin-dashboard.html');
  if (!html) return res.status(500).send('Admin dashboard template not found.');
  res.type('html').send(html);
});

app.get('/gallery', (_req, res) => {
  const html = readAndProcessTemplate('gallery.html');
  if (!html) return res.status(500).send('Gallery template not found.');
  res.type('html').send(html);
});

app.get('/profile', (req, res) => {
  const user = currentAuthUser(req);
  if (!user) {
    if (req.headers['x-assembly-auth-gate']) {
      return res.status(401).send('Login required');
    }
    res.set('x-assembly-gate', '1');
    return res.type('html').send(renderTokenGateHtml('/?login_required=profile'));
  }
  if (user.role === 'admin') return res.redirect(303, '/admin');
  const html = readAndProcessTemplate('profile.html');
  if (!html) return res.status(500).send('Profile template not found.');
  res.type('html').send(html);
});

app.get('/profiles/:role/:profileId', (req, res) => {
  const target = getPublicProfile(req.params.role, req.params.profileId);
  if (!target) {
    return res.status(404).json({ detail: { error: 'Profile not found' } });
  }
  let content = readAndProcessTemplate('profile.html');
  if (!content) return res.status(500).send('Profile template not found.');
  const targetScript = `<script>window.PROFILE_TARGET = ${JSON.stringify({ role: target.role, id: target.id })};</script>`;
  content = content.replace('</head>', `${targetScript}\n</head>`);
  return res.type('html').send(content);
});

app.get('/search', (_req, res) => {
  const html = readAndProcessTemplate('search.html');
  if (!html) return res.status(500).send('Search template not found.');
  res.type('html').send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`Assembly PC server listening on http://${HOST}:${PORT}`);
});
