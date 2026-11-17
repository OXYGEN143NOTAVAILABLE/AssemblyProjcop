"""
Migration Guide: SHA256 to Bcrypt Password Hashing
Assembly PC Simulator

This migration updates user password storage from SHA256+salt to bcrypt.
Database schema will be automatically updated by the application on startup.
"""

# ============================================================
# AUTOMATIC MIGRATION (Recommended)
# ============================================================

# The application will automatically:
# 1. Add new password_hash column if it doesn't exist
# 2. Drop old password_salt column (optional)
# 3. Convert existing password hashes (not supported - see manual migration)

# The migration runs on application startup in:
#   - ensure_admin_users_table()
#   - ensure_student_users_table()

# ============================================================
# MANUAL MIGRATION (If Needed)
# ============================================================

# If you need to manually migrate, run these SQL commands:

# Step 1: Add new column for bcrypt hashes
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash_bcrypt VARCHAR(256);
ALTER TABLE student_users ADD COLUMN IF NOT EXISTS password_hash_bcrypt VARCHAR(256);

# Step 2: Rename the new column to password_hash
ALTER TABLE admin_users 
  DROP COLUMN password_hash,
  RENAME COLUMN password_hash_bcrypt TO password_hash;

ALTER TABLE student_users 
  DROP COLUMN password_hash,
  RENAME COLUMN password_hash_bcrypt TO password_hash;

# Step 3: Remove salt column (no longer needed with bcrypt)
ALTER TABLE admin_users DROP COLUMN IF EXISTS password_salt;
ALTER TABLE student_users DROP COLUMN IF EXISTS password_salt;

# Step 4: Users need to reset passwords (bcrypt hashes can't be converted from SHA256)
# UPDATE admin_users SET password_hash = NULL WHERE password_hash IS NOT NULL;
# UPDATE student_users SET password_hash = NULL WHERE password_hash IS NOT NULL;

# Then users will be required to reset their password on next login

# ============================================================
# PASSWORD RESET FOR MIGRATING USERS
# ============================================================

# Since bcrypt and SHA256 hashes are not compatible:
# 1. Existing users CANNOT login until they reset their password
# 2. Password reset functionality needs to be implemented
# 3. Or send password reset emails to all users before migration

# Temporary solution (for testing):
# Users can register new accounts post-migration

# ============================================================
# DEPLOYMENT STEPS
# ============================================================

# 1. Backup current database
#    pg_dump -h localhost -U postgres -d pc_builder_simulation > backup_before_migration.sql

# 2. Update code to new version with bcrypt
#    git pull (or update files)

# 3. Install new dependencies
#    pip install bcrypt>=4.1.0

# 4. Update environment variables (.env)
#    - Change ADMIN_SECRET to a strong random value
#    - Verify ALLOWED_CORS_ORIGINS

# 5. Start application (automatic migration runs)
#    python app.py

# 6. Verify migration completed
#    - Check admin panel for errors
#    - Test login with new account

# 7. Notify users to reset their password
#    - Create password reset feature (TODO)
#    - Or have admin reset passwords

# 8. Monitor application for issues

# ============================================================
# ROLLBACK PROCEDURE
# ============================================================

# If migration fails, rollback to previous state:

# 1. Stop application

# 2. Restore database backup
#    psql -h localhost -U postgres -d pc_builder_simulation < backup_before_migration.sql

# 3. Revert code to previous version
#    git checkout previous_version

# 4. Restart application

# ============================================================
# VERIFICATION CHECKLIST
# ============================================================

# After migration, verify:
# [ ] Application starts without errors
# [ ] New user registration works
# [ ] New user login works
# [ ] Admin panel accessible
# [ ] Old user accounts show error on login (expected)
# [ ] Database has no password_salt column
# [ ] password_hash column contains bcrypt hashes
# [ ] Audit logs show successful migration

# ============================================================
# SECURITY BENEFITS
# ============================================================

# Migration from SHA256 to bcrypt provides:
# ✓ Stronger password hashing (much slower to crack)
# ✓ Built-in salting (no separate salt column needed)
# ✓ Adaptive rounds (can increase as computers get faster)
# ✓ Industry standard for password hashing
# ✓ Resistant to GPU and specialized hardware attacks

# Before migration:
#   - Hash speed: ~10,000 hashes/second (too fast)
#   - Salt: stored separately
#   - Risk: Modern GPU can crack many hashes quickly

# After migration:
#   - Hash speed: ~10 hashes/second (safe)
#   - Salt: built-in, random
#   - Security: Much stronger against attacks

# ============================================================
# FUTURE WORK
# ============================================================

# TODO: Implement password reset functionality
# TODO: Migrate old user accounts automatically
# TODO: Add password change enforcement after migration
# TODO: Implement password expiration policy
# TODO: Add two-factor authentication (2FA)
