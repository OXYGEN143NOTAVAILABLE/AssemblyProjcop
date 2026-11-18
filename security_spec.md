# Firestore Security Specification — Assembly PC

## Phase 0: Data Invariants
1. **Default Deny**: All unspecified paths under `/databases/{database}/documents` are denied for both reads and writes.
2. **PII Isolation**: `/users/{userId}` stores email and studentId PII. Only the verified owner (`request.auth.uid == userId`) or a verified admin (`isAdmin()`) may `get` the document; collection `list` is disabled (`false`). Public profiles live separately in `/publicProfiles/{userId}` without PII.
3. **No Self-Assigned Roles**: On `/users/{userId}` and `/publicProfiles/{userId}` creation, `role` is restricted to `'student'` or `'instructor'` (never `'admin'`), and `role` cannot be escalated on update by non-admins.
4. **Strict Ownership & Immutability**: `/builds/{buildId}` documents must enforce `ownerUid == request.auth.uid` on `create`, and `ownerUid`, `buildId`, `createdAt` remain immutable on `update`.
5. **Temporal Integrity**: `createdAt == request.time` on `create` and `updatedAt == request.time` on both `create` and `update`.
6. **Verified Email Mandate**: Standard client writes require `request.auth.token.email_verified == true`.
7. **Action-Based Updates & Size Limits**: Every string, ID, and number obeys bounded checks, and updates allow only explicit keys via `affectedKeys().hasOnly(...)`.
8. **Secure List Queries**: `allow list` on `/builds/{buildId}` evaluates `resource.data` directly (`resource.data.isPublished == true || (isSignedIn() && resource.data.ownerUid == request.auth.uid) || isAdmin()`).

## The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Private Read**: Unauthenticated `GET /users/u1` -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: Signed-in `u2` reading `GET /users/u1` -> `PERMISSION_DENIED`.
3. **Self-Assigned Admin Privilege Escalation**: `u1` creates `/users/u1` with `{ role: "admin", ... }` -> `PERMISSION_DENIED`.
4. **Shadow/Ghost Field Injection**: `u1` creates `/users/u1` with `{ ..., isVerified: true }` -> `PERMISSION_DENIED`.
5. **Client Timestamp Spoofing**: `u1` creates `/builds/b1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
6. **Immortality / Owner Tampering**: `u1` updates `/builds/b1` changing `ownerUid: "u2"` -> `PERMISSION_DENIED`.
7. **Oversized Path ID Poisoning**: `u1` creates `/builds/${'a'.repeat(200)}` with >128 chars or invalid regex characters (`../bad`) -> `PERMISSION_DENIED`.
8. **Oversized Payload String Exhaustion**: `u1` creates `/builds/b1` with `buildName` > 160 chars or `summary` > 500 chars -> `PERMISSION_DENIED`.
9. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts write to `/users/u1` -> `PERMISSION_DENIED`.
10. **Admin Doc Forgery**: Non-admin user writes `/admins/u1` -> `PERMISSION_DENIED`.
11. **Unscoped List Enumeration**: Non-admin executes `LIST /users` or lists unpublished builds of another user -> `PERMISSION_DENIED`.
12. **PublicProfile Role Mutation**: `u1` updates `/publicProfiles/u1` modifying `role` or `uid` alongside `displayName` -> `PERMISSION_DENIED`.
