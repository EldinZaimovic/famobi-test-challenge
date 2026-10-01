import { createDatabase } from "./firebase.js";
import { createApp } from "./app.js";

const db = createDatabase();
const server = createApp(db).listen(3001, "127.0.0.1", () =>
  console.log("Analytics API: http://127.0.0.1:3001"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await db.terminate();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
