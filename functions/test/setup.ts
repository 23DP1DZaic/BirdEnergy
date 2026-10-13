/**
 * Shared test bootstrap — imported for its side effects, before any module
 * under src/, by every test file (directly or via helpers/).
 *
 * The Cloud Functions read configuration from process.env while they are being
 * imported, so this has to run first:
 *   - TELEGRAM_BOT_TOKEN: botcommand.ts throws at import time without it. The
 *     value is a dummy — no test ever calls the Telegram API.
 *   - ADMIN_TELEGRAM_IDS: the server-side admin whitelist (AUTH-03).
 *
 * Initializing firebase-functions-test also sets FIREBASE_CONFIG and
 * GCLOUD_PROJECT, which is what lets src/index.ts run initializeApp() without
 * credentials; its wrap() turns a v2 callable into a plain async function.
 */
import initFunctionsTest from "firebase-functions-test";

process.env.TELEGRAM_BOT_TOKEN = "123456:TEST_TOKEN";
process.env.ADMIN_TELEGRAM_IDS = "999999999";

export const testEnv = initFunctionsTest({ projectId: "birdenergy-test" });
