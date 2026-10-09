import express, { type ErrorRequestHandler } from "express";
import { ACTORS, HttpError, isActor, isStatus } from "./domain.js";
import { FileTaskStore } from "./store.js";

export function createApp(store: FileTaskStore) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/actors", (_request, response) => response.json(ACTORS));
  app.get("/api/tasks", (request, response) => {
    response.json(store.listTasks(request.query.includeDeleted === "true"));
  });
  app.post("/api/tasks", (request, response) => {
    const title = request.body?.title;
    if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 120) {
      throw new HttpError(400, "Title must be between 1 and 120 characters");
    }
    response.status(201).json(store.createTask(title.trim()));
  });
  app.put("/api/tasks/:id/status", (request, response) => {
    const { status, actorId, expectedStatus } = request.body ?? {};
    if (!isStatus(status)) throw new HttpError(400, "Invalid status");
    if (!isActor(actorId)) throw new HttpError(400, "Invalid actor");
    if (expectedStatus !== undefined && !isStatus(expectedStatus)) {
      throw new HttpError(400, "Invalid expected status");
    }
    response.json(store.updateStatus(request.params.id, status, actorId, expectedStatus));
  });
  app.delete("/api/tasks/:id", (request, response) => {
    response.json(store.deleteTask(request.params.id));
  });
  app.get("/api/tasks/:id/audit-logs", (request, response) => {
    response.json(store.listAuditLogs(request.params.id));
  });

  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(handleError);
  return app;
}
