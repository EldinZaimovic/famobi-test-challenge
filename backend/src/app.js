import express from "express";
import { ZodError } from "zod";
import { batchSchema, querySchema, ConflictError } from "./validation.js";
import { dashboard, ingest } from "./store.js";

export function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Browsers access /api through Vite. Reject foreign origins before writes.
    const origin = req.get("origin");
    if (
      origin &&
      !/^http:\/\/(127\.0\.0\.1|localhost):(5173|5174)$/.test(origin)
    ) {
      return res.status(403).json({ error: "origin_not_allowed" });
    }
    next();
  });
  app.use(express.json({ limit: "64kb", strict: true }));
  app.get("/api/health", async (_req, res) => {
    try {
      await db.collection("attempts").limit(1).get();
      res.json({ status: "ok", storage: "firestore-emulator" });
    } catch {
      res.status(503).json({ error: "storage_unavailable" });
    }
  });
  app.post("/api/events", async (req, res) => {
    if (!req.is("application/json"))
      return res.status(415).json({ error: "application_json_required" });
    const { events } = batchSchema.parse(req.body);
    res.json(await ingest(db, events));
  });
  app.get("/api/dashboard", async (req, res) =>
    res.json(await dashboard(db, querySchema.parse(req.query))),
  );
  app.use((_req, res) => res.status(404).json({ error: "not_found" }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: "invalid_request",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if (error instanceof ConflictError)
      return res
        .status(409)
        .json({ error: "event_conflict", message: error.message });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "payload_too_large" });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "invalid_json" });
    console.error("Storage request failed:", error.message);
    res.status(503).json({ error: "storage_unavailable" });
  });
  return app;
}
