import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '/firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  const path = 'test/connection';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { ok: false, offline: true, error: error.message };
    }
    if (error instanceof Error && /permission/i.test(error.message)) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function clampString(value, maxLen) {
  return String(value ?? '').trim().slice(0, maxLen);
}

export async function syncUserProfileToFirestore(profile) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;
  const uid = clampString(currentUser.uid, 128);
  const role = profile?.role === 'instructor' ? 'instructor' : 'student';
  const displayName = clampString(profile?.displayName || currentUser.displayName || 'User', 120) || 'User';
  const email = clampString(profile?.email || currentUser.email || '', 180);
  const studentId = clampString(profile?.studentId || '', 80);
  const buildCount = Math.max(0, Math.min(10000, Number(profile?.buildCount || 0)));
  const badgeCount = Math.max(0, Math.min(1000, Number(profile?.badgeCount || 0)));

  const userRef = doc(db, 'users', uid);
  const pubRef = doc(db, 'publicProfiles', uid);
  const userPath = `users/${uid}`;
  const pubPath = `publicProfiles/${uid}`;

  let existingUser = null;
  try {
    existingUser = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let existingPub = null;
  try {
    existingPub = await getDoc(pubRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, pubPath);
  }

  if (!existingUser.exists() && !existingPub.exists()) {
    const batch = writeBatch(db);
    batch.set(userRef, {
      uid,
      email,
      studentId,
      role,
      displayName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(pubRef, {
      uid,
      displayName,
      role,
      buildCount,
      badgeCount,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
    return uid;
  }

  if (existingUser.exists()) {
    try {
      await updateDoc(userRef, {
        displayName,
        studentId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  if (!existingPub.exists()) {
    try {
      await setDoc(pubRef, {
        uid,
        displayName,
        role,
        buildCount,
        badgeCount,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, pubPath);
    }
  } else {
    try {
      await updateDoc(pubRef, {
        displayName,
        buildCount,
        badgeCount,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, pubPath);
    }
  }

  return uid;
}

export async function syncBuildToFirestore(build) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;
  const buildId = clampString(String(build?.id ?? build?.build_id ?? '').replace(/[^a-zA-Z0-9_-]/g, ''), 128);
  if (!buildId) return null;

  const path = `builds/${buildId}`;
  const buildRef = doc(db, 'builds', buildId);
  const buildName = clampString(build?.buildName || build?.name || 'Untitled Build', 160) || 'Untitled Build';
  const summary = clampString(build?.summary || '', 500);
  const score = Math.max(0, Math.min(100, Number(build?.score ?? 100)));
  const isPublished = build?.isPublished !== false;

  let snap = null;
  try {
    snap = await getDoc(buildRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (snap.exists()) {
    try {
      await updateDoc(buildRef, {
        buildName,
        summary,
        score,
        isPublished,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return buildId;
  }

  try {
    await setDoc(buildRef, {
      buildId,
      ownerUid: clampString(currentUser.uid, 128),
      buildName,
      summary,
      score,
      isPublished,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return buildId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

if (typeof window !== 'undefined') {
  window.AssemblyFirebase = {
    db,
    auth,
    OperationType,
    handleFirestoreError,
    testConnection,
    syncUserProfileToFirestore,
    syncBuildToFirestore,
  };
  testConnection().catch(() => {});
}
