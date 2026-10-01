import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function createDatabase(env = process.env) {
  const host = env.FIRESTORE_EMULATOR_HOST;
  const projectId = env.GCLOUD_PROJECT || "demo-neon-snake";
  // Fail closed: never discover credentials or connect to a real Firebase service.
  if (
    !/^127\.0\.0\.1:\d+$/.test(host || "") ||
    !projectId.startsWith("demo-")
  ) {
    throw new Error(
      "Requires FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> and a demo- project. Run npm run dev.",
    );
  }
  return getFirestore(initializeApp({ projectId }));
}
