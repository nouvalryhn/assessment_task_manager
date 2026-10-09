import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { FileTaskStore } from "../src/store.js";

const directories: string[] = [];
function makeStore() {
  const directory = mkdtempSync(join(tmpdir(), "task-ledger-"));
  directories.push(directory);
  const file = join(directory, "tasks.json");
  return { store: new FileTaskStore(file), file };
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("status advances in order and each real change has one chronological log", () => {
  const { store } = makeStore();
  const task = store.createTask("Prepare invoice");
  assert.equal(task.status, "to_do");
  assert.deepEqual(store.listAuditLogs(task.id), []);

  assert.throws(() => store.updateStatus(task.id, "in_progress", "john.doe"), { statusCode: 409 });
  assert.equal(store.listAuditLogs(task.id).length, 0);

  assert.equal(store.updateStatus(task.id, "pending", "john.doe").changed, true);
  assert.equal(store.updateStatus(task.id, "pending", "john.doe").changed, false);
  store.updateStatus(task.id, "in_progress", "jane.smith");
  store.updateStatus(task.id, "done", "alex.lee");
  assert.throws(() => store.updateStatus(task.id, "to_do", "john.doe"), { statusCode: 409 });

  const logs = store.listAuditLogs(task.id);
  assert.deepEqual(logs.map(({ fromStatus, toStatus, actorId }) => [fromStatus, toStatus, actorId]), [
    ["to_do", "pending", "john.doe"],
    ["pending", "in_progress", "jane.smith"],
    ["in_progress", "done", "alex.lee"],
  ]);
  assert.deepEqual(logs.map((log) => log.sequence), [1, 2, 3]);
  assert.equal(store.listTasks()[0].status, logs.at(-1)?.toStatus);
});

test("stale expected status is rejected without changing task or history", () => {
  const { store } = makeStore();
  const task = store.createTask("Review report");
  store.updateStatus(task.id, "pending", "john.doe");
  assert.throws(() => store.updateStatus(task.id, "in_progress", "jane.smith", "to_do"), { statusCode: 409 });
  assert.equal(store.listTasks()[0].status, "pending");
  assert.equal(store.listAuditLogs(task.id).length, 1);
});

test("deleting hides the task but keeps its audit history after restart", () => {
  const { store, file } = makeStore();
  const task = store.createTask("Ship update");
  store.updateStatus(task.id, "pending", "john.doe");
  store.deleteTask(task.id);

  const reopened = new FileTaskStore(file);
  assert.deepEqual(reopened.listTasks(), []);
  assert.equal(reopened.listTasks(true)[0].deletedAt !== null, true);
  assert.deepEqual(reopened.listAuditLogs(task.id).map((log) => log.toStatus), ["pending"]);
  assert.throws(() => reopened.updateStatus(task.id, "in_progress", "john.doe"), { statusCode: 404 });
  const snapshot = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(snapshot.tasks[0].status, snapshot.auditLogs[0].toStatus);
});
