/**
 * Helpers for invoking a v2 callable in tests plus the auth contexts the Cloud
 * Functions branch on. Importing ../setup.js first guarantees the functions'
 * env is in place before any src/ module is loaded.
 */
import "../setup.js";
import { testEnv } from "../setup.js";

export interface TestAuth {
  uid: string;
  token: Record<string, unknown>;
}

export interface TestRequest {
  data: unknown;
  auth?: TestAuth;
}

export type WrappedCallable<T> = (request: TestRequest) => Promise<T>;

/**
 * Turns an onCall Cloud Function into a plain async function that takes a
 * {data, auth} object (firebase-functions-test's wrap for v2 callables). The
 * cast only relaxes the request type; the test never supplies rawRequest.
 */
export function wrapCallable<T>(fn: unknown): WrappedCallable<T> {
  return (testEnv.wrap as (f: unknown) => WrappedCallable<T>)(fn);
}

/** Admin-role caller — telegramId matches ADMIN_TELEGRAM_IDS in setup.ts. */
export const ADMIN_AUTH: TestAuth = {
  uid: "tg-999999999",
  token: {role: "admin", telegramId: 999999999},
};

/** Signed-in caller without the admin role. */
export const USER_AUTH: TestAuth = {
  uid: "tg-111111111",
  token: {role: "user", telegramId: 111111111},
};

/**
 * Awaits a callable that must reject and returns its error code
 * (HttpsError.code, e.g. "permission-denied"), failing if it resolves.
 */
export async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as {code?: string}).code ?? "";
  }
  throw new Error("Expected the callable to reject, but it resolved.");
}
