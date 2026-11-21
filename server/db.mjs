import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createInitialStore } from './seedData.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'assemblypc.db');

export class AppDatabase {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedIfNeeded();
  }

  close() {
    this.db.close();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS db_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS student_users (
        student_id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS component_items (
        category TEXT NOT NULL,
        id INTEGER NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (category, id)
      );

      CREATE TABLE IF NOT EXISTS pc_scenarios (
        scenario_id INTEGER PRIMARY KEY AUTOINCREMENT,
        instructor_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        activity_type TEXT NOT NULL DEFAULT 'build',
        tier TEXT NOT NULL DEFAULT '',
        budget REAL,
        time_limit_minutes INTEGER,
        objectives_json TEXT NOT NULL DEFAULT '[]',
        troubleshooting_json TEXT NOT NULL DEFAULT '[]',
        constraints_json TEXT NOT NULL DEFAULT '{}',
        is_published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_builds (
        build_id INTEGER PRIMARY KEY AUTOINCREMENT,
        build_name TEXT NOT NULL,
        owner_role TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        is_published INTEGER NOT NULL DEFAULT 1,
        build_data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS build_hearts (
        heart_id INTEGER PRIMARY KEY AUTOINCREMENT,
        build_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(build_id, user_role, user_id)
      );

      CREATE TABLE IF NOT EXISTS build_favorites (
        favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
        build_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(build_id, user_role, user_id)
      );

      CREATE TABLE IF NOT EXISTS user_badges (
        badge_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_role TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        badge_key TEXT NOT NULL,
        badge_name TEXT NOT NULL,
        badge_description TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        UNIQUE(user_role, user_id, badge_key)
      );

      CREATE TABLE IF NOT EXISTS scenario_completions (
        completion_id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id INTEGER NOT NULL,
        user_role TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        score REAL,
        completed_at TEXT NOT NULL,
        UNIQUE(scenario_id, user_role, user_id)
      );
    `);
  }

  seedIfNeeded() {
    const seeded = this.db.prepare('SELECT meta_value FROM db_meta WHERE meta_key = ?').get('seeded_v1');
    if (seeded) return;

    const existingAdmins = this.db.prepare('SELECT COUNT(*) AS cnt FROM admin_users').get().cnt;
    const existingStudents = this.db.prepare('SELECT COUNT(*) AS cnt FROM student_users').get().cnt;
    const existingComponents = this.db.prepare('SELECT COUNT(*) AS cnt FROM component_items').get().cnt;

    if (existingAdmins > 0 || existingStudents > 0 || existingComponents > 0) {
      this.db.prepare('INSERT OR REPLACE INTO db_meta (meta_key, meta_value) VALUES (?, ?)').run('seeded_v1', new Date().toISOString());
      return;
    }

    const seed = createInitialStore();
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const insertAdmin = this.db.prepare(`
        INSERT INTO admin_users (admin_id, username, password_hash, display_name, role, is_active, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of seed.admin_users) {
        insertAdmin.run(
          a.admin_id,
          a.username,
          a.password_hash,
          a.display_name,
          a.role,
          a.is_active ? 1 : 0,
          a.last_login_at,
          a.created_at,
          a.updated_at
        );
      }

      const insertStudent = this.db.prepare(`
        INSERT INTO student_users (student_id, school_id, email, password_hash, first_name, last_name, display_name, is_active, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of seed.student_users) {
        insertStudent.run(
          s.student_id,
          s.school_id,
          s.email,
          s.password_hash,
          s.first_name,
          s.last_name,
          s.display_name,
          s.is_active ? 1 : 0,
          s.last_login_at,
          s.created_at,
          s.updated_at
        );
      }

      const insertComponent = this.db.prepare(`
        INSERT INTO component_items (category, id, brand, model, data_json)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const [category, rows] of Object.entries(seed.components)) {
        for (const row of rows) {
          insertComponent.run(category, row.id, row.brand || '', row.model || '', JSON.stringify(row));
        }
      }

      const insertScenario = this.db.prepare(`
        INSERT INTO pc_scenarios (scenario_id, instructor_id, title, description, activity_type, tier, budget, time_limit_minutes, objectives_json, troubleshooting_json, constraints_json, is_published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const sc of seed.pc_scenarios) {
        insertScenario.run(
          sc.scenario_id,
          sc.instructor_id,
          sc.title,
          sc.description || '',
          sc.activity_type || 'build',
          sc.tier || '',
          sc.budget ?? null,
          sc.time_limit_minutes ?? null,
          JSON.stringify(sc.objectives || []),
          JSON.stringify(sc.troubleshooting || []),
          JSON.stringify(sc.constraints || {}),
          sc.is_published ? 1 : 0,
          sc.created_at,
          sc.updated_at
        );
      }

      const insertBuild = this.db.prepare(`
        INSERT INTO saved_builds (build_id, build_name, owner_role, owner_id, is_published, build_data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of seed.saved_builds) {
        insertBuild.run(
          b.build_id,
          b.build_name,
          b.owner_role,
          b.owner_id,
          b.is_published ? 1 : 0,
          JSON.stringify(b.build_data || {}),
          b.created_at,
          b.updated_at
        );
      }

      const insertHeart = this.db.prepare(`
        INSERT INTO build_hearts (heart_id, build_id, user_role, user_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const h of seed.build_hearts) {
        insertHeart.run(h.heart_id, h.build_id, h.user_role, h.user_id, h.created_at);
      }

      const insertBadge = this.db.prepare(`
        INSERT INTO user_badges (badge_id, user_role, user_id, badge_key, badge_name, badge_description, earned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const badge of seed.user_badges) {
        insertBadge.run(
          badge.badge_id,
          badge.user_role,
          badge.user_id,
          badge.badge_key,
          badge.badge_name,
          badge.badge_description,
          badge.earned_at
        );
      }

      this.db.prepare('INSERT OR REPLACE INTO db_meta (meta_key, meta_value) VALUES (?, ?)').run('seeded_v1', new Date().toISOString());
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  loadStore() {
    const components = {
      cpu: [],
      gpu: [],
      psu: [],
      ssd: [],
      hdd: [],
      fan: [],
      mobo: [],
      ram: [],
    };
    const nextIds = {
      cpu: 1,
      mobo: 1,
      ram: 1,
      gpu: 1,
      psu: 1,
      ssd: 1,
      hdd: 1,
      fan: 1,
      admin_user: 1,
      student_user: 1,
      scenario: 1,
      build: 1,
      favorite: 1,
      heart: 1,
      badge: 1,
      completion: 1,
    };

    const compRows = this.db.prepare('SELECT category, id, data_json FROM component_items ORDER BY id ASC').all();
    for (const row of compRows) {
      if (!components[row.category]) continue;
      const parsed = JSON.parse(row.data_json);
      components[row.category].push(parsed);
      if (Number(row.id) >= nextIds[row.category]) {
        nextIds[row.category] = Number(row.id) + 1;
      }
    }

    const admin_users = this.db
      .prepare('SELECT * FROM admin_users ORDER BY admin_id ASC')
      .all()
      .map((u) => ({
        admin_id: Number(u.admin_id),
        username: u.username,
        password_hash: u.password_hash,
        display_name: u.display_name,
        role: u.role,
        is_active: Boolean(u.is_active),
        last_login_at: u.last_login_at,
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));
    if (admin_users.length) {
      nextIds.admin_user = Math.max(...admin_users.map((u) => u.admin_id)) + 1;
    }

    const student_users = this.db
      .prepare('SELECT * FROM student_users ORDER BY student_id ASC')
      .all()
      .map((s) => ({
        student_id: Number(s.student_id),
        school_id: s.school_id,
        email: s.email,
        password_hash: s.password_hash,
        first_name: s.first_name,
        last_name: s.last_name,
        display_name: s.display_name,
        is_active: Boolean(s.is_active),
        last_login_at: s.last_login_at,
        created_at: s.created_at,
        updated_at: s.updated_at,
      }));
    if (student_users.length) {
      nextIds.student_user = Math.max(...student_users.map((s) => s.student_id)) + 1;
    }

    const pc_scenarios = this.db
      .prepare('SELECT * FROM pc_scenarios ORDER BY scenario_id ASC')
      .all()
      .map((sc) => ({
        scenario_id: Number(sc.scenario_id),
        instructor_id: Number(sc.instructor_id),
        title: sc.title,
        description: sc.description,
        activity_type: sc.activity_type,
        tier: sc.tier,
        budget: sc.budget !== null ? Number(sc.budget) : null,
        time_limit_minutes: sc.time_limit_minutes !== null ? Number(sc.time_limit_minutes) : null,
        objectives: JSON.parse(sc.objectives_json || '[]'),
        troubleshooting: JSON.parse(sc.troubleshooting_json || '[]'),
        constraints: JSON.parse(sc.constraints_json || '{}'),
        is_published: Boolean(sc.is_published),
        created_at: sc.created_at,
        updated_at: sc.updated_at,
      }));
    if (pc_scenarios.length) {
      nextIds.scenario = Math.max(...pc_scenarios.map((sc) => sc.scenario_id)) + 1;
    }

    const saved_builds = this.db
      .prepare('SELECT * FROM saved_builds ORDER BY build_id ASC')
      .all()
      .map((b) => ({
        build_id: Number(b.build_id),
        build_name: b.build_name,
        owner_role: b.owner_role,
        owner_id: Number(b.owner_id),
        is_published: Boolean(b.is_published),
        build_data: JSON.parse(b.build_data_json || '{}'),
        created_at: b.created_at,
        updated_at: b.updated_at,
      }));
    if (saved_builds.length) {
      nextIds.build = Math.max(...saved_builds.map((b) => b.build_id)) + 1;
    }

    const build_favorites = this.db
      .prepare('SELECT * FROM build_favorites ORDER BY favorite_id ASC')
      .all()
      .map((f) => ({
        favorite_id: Number(f.favorite_id),
        build_id: Number(f.build_id),
        user_role: f.user_role,
        user_id: Number(f.user_id),
        created_at: f.created_at,
      }));
    if (build_favorites.length) {
      nextIds.favorite = Math.max(...build_favorites.map((f) => f.favorite_id)) + 1;
    }

    const build_hearts = this.db
      .prepare('SELECT * FROM build_hearts ORDER BY heart_id ASC')
      .all()
      .map((h) => ({
        heart_id: Number(h.heart_id),
        build_id: Number(h.build_id),
        user_role: h.user_role,
        user_id: Number(h.user_id),
        created_at: h.created_at,
      }));
    if (build_hearts.length) {
      nextIds.heart = Math.max(...build_hearts.map((h) => h.heart_id)) + 1;
    }

    const user_badges = this.db
      .prepare('SELECT * FROM user_badges ORDER BY badge_id ASC')
      .all()
      .map((b) => ({
        badge_id: Number(b.badge_id),
        user_role: b.user_role,
        user_id: Number(b.user_id),
        badge_key: b.badge_key,
        badge_name: b.badge_name,
        badge_description: b.badge_description,
        earned_at: b.earned_at,
      }));
    if (user_badges.length) {
      nextIds.badge = Math.max(...user_badges.map((b) => b.badge_id)) + 1;
    }

    const scenario_completions = this.db
      .prepare('SELECT * FROM scenario_completions ORDER BY completion_id ASC')
      .all()
      .map((c) => ({
        completion_id: Number(c.completion_id),
        scenario_id: Number(c.scenario_id),
        user_role: c.user_role,
        user_id: Number(c.user_id),
        score: c.score !== null ? Number(c.score) : null,
        completed_at: c.completed_at,
      }));
    if (scenario_completions.length) {
      nextIds.completion = Math.max(...scenario_completions.map((c) => c.completion_id)) + 1;
    }

    return {
      components,
      admin_users,
      student_users,
      pc_scenarios,
      saved_builds,
      build_favorites,
      build_hearts,
      user_badges,
      scenario_completions,
      nextIds,
    };
  }

  insertStudent(user) {
    const res = this.db
      .prepare(`
        INSERT INTO student_users (school_id, email, password_hash, first_name, last_name, display_name, is_active, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.school_id,
        user.email,
        user.password_hash,
        user.first_name,
        user.last_name,
        user.display_name,
        user.is_active ? 1 : 0,
        user.last_login_at,
        user.created_at,
        user.updated_at
      );
    return { ...user, student_id: Number(res.lastInsertRowid) };
  }

  updateStudentLogin(studentId, lastLoginAt) {
    this.db
      .prepare('UPDATE student_users SET last_login_at = ?, updated_at = ? WHERE student_id = ?')
      .run(lastLoginAt, lastLoginAt, Number(studentId));
  }

  updateStudentPassword(studentId, passwordHash, updatedAt) {
    this.db
      .prepare('UPDATE student_users SET password_hash = ?, updated_at = ? WHERE student_id = ?')
      .run(passwordHash, updatedAt, Number(studentId));
  }

  insertAdminUser(user) {
    const res = this.db
      .prepare(`
        INSERT INTO admin_users (username, password_hash, display_name, role, is_active, last_login_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        user.username,
        user.password_hash,
        user.display_name,
        user.role,
        user.is_active ? 1 : 0,
        user.last_login_at,
        user.created_at,
        user.updated_at
      );
    return { ...user, admin_id: Number(res.lastInsertRowid) };
  }

  updateAdminLogin(adminId, lastLoginAt) {
    this.db
      .prepare('UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE admin_id = ?')
      .run(lastLoginAt, lastLoginAt, Number(adminId));
  }

  updateAdminPassword(adminId, passwordHash, updatedAt) {
    this.db
      .prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE admin_id = ?')
      .run(passwordHash, updatedAt, Number(adminId));
  }

  deleteStudentCascade(studentId) {
    const id = Number(studentId);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM student_users WHERE student_id = ?').run(id);
      this.db.prepare('DELETE FROM saved_builds WHERE owner_role = ? AND owner_id = ?').run('student', id);
      this.db.prepare('DELETE FROM build_favorites WHERE user_role = ? AND user_id = ?').run('student', id);
      this.db.prepare('DELETE FROM build_hearts WHERE user_role = ? AND user_id = ?').run('student', id);
      this.db.prepare('DELETE FROM user_badges WHERE user_role = ? AND user_id = ?').run('student', id);
      this.db.prepare('DELETE FROM scenario_completions WHERE user_role = ? AND user_id = ?').run('student', id);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  deleteInstructorCascade(adminId) {
    const id = Number(adminId);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM admin_users WHERE admin_id = ? AND role = ?').run(id, 'instructor');
      this.db.prepare('DELETE FROM pc_scenarios WHERE instructor_id = ?').run(id);
      this.db.prepare('DELETE FROM saved_builds WHERE owner_role = ? AND owner_id = ?').run('instructor', id);
      this.db.prepare('DELETE FROM build_favorites WHERE user_role = ? AND user_id = ?').run('instructor', id);
      this.db.prepare('DELETE FROM build_hearts WHERE user_role = ? AND user_id = ?').run('instructor', id);
      this.db.prepare('DELETE FROM user_badges WHERE user_role = ? AND user_id = ?').run('instructor', id);
      this.db.prepare('DELETE FROM scenario_completions WHERE user_role = ? AND user_id = ?').run('instructor', id);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  upsertComponent(category, row) {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO component_items (category, id, brand, model, data_json)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(category, Number(row.id), row.brand || '', row.model || '', JSON.stringify(row));
  }

  deleteComponent(category, id) {
    this.db.prepare('DELETE FROM component_items WHERE category = ? AND id = ?').run(category, Number(id));
  }

  insertScenario(row) {
    const res = this.db
      .prepare(`
        INSERT INTO pc_scenarios (instructor_id, title, description, activity_type, tier, budget, time_limit_minutes, objectives_json, troubleshooting_json, constraints_json, is_published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        Number(row.instructor_id),
        row.title,
        row.description || '',
        row.activity_type || 'build',
        row.tier || '',
        row.budget ?? null,
        row.time_limit_minutes ?? null,
        JSON.stringify(row.objectives || []),
        JSON.stringify(row.troubleshooting || []),
        JSON.stringify(row.constraints || {}),
        row.is_published ? 1 : 0,
        row.created_at,
        row.updated_at
      );
    return { ...row, scenario_id: Number(res.lastInsertRowid) };
  }

  insertBuild(row) {
    const res = this.db
      .prepare(`
        INSERT INTO saved_builds (build_name, owner_role, owner_id, is_published, build_data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        row.build_name,
        row.owner_role,
        Number(row.owner_id),
        row.is_published ? 1 : 0,
        JSON.stringify(row.build_data || {}),
        row.created_at,
        row.updated_at
      );
    return { ...row, build_id: Number(res.lastInsertRowid) };
  }

  updateBuild(row) {
    this.db
      .prepare('UPDATE saved_builds SET build_name = ?, build_data_json = ?, updated_at = ? WHERE build_id = ?')
      .run(row.build_name, JSON.stringify(row.build_data || {}), row.updated_at, Number(row.build_id));
  }

  deleteBuild(buildId) {
    const id = Number(buildId);
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM saved_builds WHERE build_id = ?').run(id);
      this.db.prepare('DELETE FROM build_hearts WHERE build_id = ?').run(id);
      this.db.prepare('DELETE FROM build_favorites WHERE build_id = ?').run(id);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  insertHeart(row) {
    const res = this.db
      .prepare('INSERT INTO build_hearts (build_id, user_role, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(Number(row.build_id), row.user_role, Number(row.user_id), row.created_at);
    return { ...row, heart_id: Number(res.lastInsertRowid) };
  }

  deleteHeart(buildId, userRole, userId) {
    this.db
      .prepare('DELETE FROM build_hearts WHERE build_id = ? AND user_role = ? AND user_id = ?')
      .run(Number(buildId), userRole, Number(userId));
  }

  insertFavorite(row) {
    const res = this.db
      .prepare('INSERT INTO build_favorites (build_id, user_role, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(Number(row.build_id), row.user_role, Number(row.user_id), row.created_at);
    return { ...row, favorite_id: Number(res.lastInsertRowid) };
  }

  deleteFavorite(buildId, userRole, userId) {
    this.db
      .prepare('DELETE FROM build_favorites WHERE build_id = ? AND user_role = ? AND user_id = ?')
      .run(Number(buildId), userRole, Number(userId));
  }

  insertBadge(row) {
    const res = this.db
      .prepare(`
        INSERT OR IGNORE INTO user_badges (user_role, user_id, badge_key, badge_name, badge_description, earned_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(row.user_role, Number(row.user_id), row.badge_key, row.badge_name, row.badge_description, row.earned_at);
    return { ...row, badge_id: Number(res.lastInsertRowid) };
  }

  upsertScenarioCompletion(row) {
    this.db
      .prepare(`
        INSERT INTO scenario_completions (scenario_id, user_role, user_id, score, completed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(scenario_id, user_role, user_id)
        DO UPDATE SET score = excluded.score, completed_at = excluded.completed_at
      `)
      .run(Number(row.scenario_id), row.user_role, Number(row.user_id), row.score, row.completed_at);
    const saved = this.db
      .prepare('SELECT * FROM scenario_completions WHERE scenario_id = ? AND user_role = ? AND user_id = ?')
      .get(Number(row.scenario_id), row.user_role, Number(row.user_id));
    return {
      completion_id: Number(saved.completion_id),
      scenario_id: Number(saved.scenario_id),
      user_role: saved.user_role,
      user_id: Number(saved.user_id),
      score: saved.score !== null ? Number(saved.score) : null,
      completed_at: saved.completed_at,
    };
  }

  stats() {
    const students = this.db.prepare('SELECT COUNT(*) AS cnt FROM student_users').get().cnt;
    const admins = this.db.prepare('SELECT COUNT(*) AS cnt FROM admin_users').get().cnt;
    const builds = this.db.prepare('SELECT COUNT(*) AS cnt FROM saved_builds').get().cnt;
    const components = this.db.prepare('SELECT COUNT(*) AS cnt FROM component_items').get().cnt;
    return { students, admins, builds, components };
  }
}
