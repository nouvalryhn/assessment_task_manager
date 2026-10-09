import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { FileTaskStore } from "../src/store.js";

const directory = mkdtempSync(join(tmpdir(), "task-ledger-api-"));
let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp(new FileTaskStore(join(directory, "tasks.json"))).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  rmSync(directory, { recursive: true, force: true });
});

async function request(path: string, method = "GET", body?: object) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

test("API validates input, preserves idempotency, and exposes deleted history", async () => {
  assert.equal((await request("/tasks", "POST", { title: "  " })).status, 400);
  const created = await request("/tasks", "POST", { title: "  Prepare invoice  " });
  assert.equal(created.status, 201);
  const task = created.data;
  assert.equal(task.title, "Prepare invoice");

  assert.equal((await request(`/tasks/${task.id}/status`, "PUT", { status: "pending", actorId: "unknown" })).status, 400);
  assert.equal((await request(`/tasks/${task.id}/status`, "PUT", { status: "done", actorId: "john.doe" })).status, 409);
  const payload = { status: "pending", actorId: "john.doe", expectedStatus: "to_do" };
  assert.equal((await request(`/tasks/${task.id}/status`, "PUT", payload)).data.changed, true);
  assert.equal((await request(`/tasks/${task.id}/status`, "PUT", payload)).data.changed, false);
  assert.equal((await request(`/tasks/${task.id}/audit-logs`)).data.length, 1);

  assert.equal((await request(`/tasks/${task.id}`, "DELETE")).status, 200);
  assert.equal((await request("/tasks")).data.length, 0);
  assert.equal((await request("/tasks?includeDeleted=true")).data.length, 1);
  assert.equal((await request(`/tasks/${task.id}/audit-logs`)).data.length, 1);
});
