/**
 * A minimal stand-in for the Admin Auth SDK, so authenticateTelegram can be
 * tested without credentials. installFakeAuth() patches the module-level
 * getAuth() the same way fakeFirestore does for Firestore, and returns the
 * recorded calls so tests can assert on claims and minted tokens.
 */
import { createRequire } from "node:module";

const nodeRequire = createRequire(__filename);

interface UserRecord {
  uid: string;
  displayName?: string;
}

export interface FakeAuth {
  created: UserRecord[];
  claims: Map<string, unknown>;
  tokens: Array<{ uid: string; claims?: Record<string, unknown> }>;
}

export function installFakeAuth(): FakeAuth {
  const state: FakeAuth = {created: [], claims: new Map(), tokens: []};
  const authModule = nodeRequire("firebase-admin/auth");
  authModule.getAuth = () => ({
    async getUser(uid: string) {
      throw Object.assign(new Error(`no user ${uid}`), {
        code: "auth/user-not-found",
      });
    },
    async createUser(record: UserRecord) {
      state.created.push(record);
      return {uid: record.uid};
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      state.claims.set(uid, claims);
    },
    async createCustomToken(uid: string, claims?: Record<string, unknown>) {
      state.tokens.push({uid, claims});
      return `custom-${uid}`;
    },
  });
  return state;
}
