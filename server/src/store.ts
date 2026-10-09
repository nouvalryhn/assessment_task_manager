import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { HttpError, STATUSES, type AuditLog, type State, type Status, type Task } from "./domain.js";

const emptyState = (): State => ({ tasks: [], auditLogs: [], nextSequence: 1 });

export class FileTaskStore {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) this.write(emptyState());
  }

  private read(): State {
    return JSON.parse(readFileSync(this.filePath, "utf8")) as State;
  }

  // Replace one complete snapshot, so a failed write cannot leave a changed
  // status without its matching audit entry (or the reverse).
  private write(state: State): void {
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const file = openSync(temporaryPath, "wx");
      try {
        writeFileSync(file, JSON.stringify(state, null, 2));
        fsyncSync(file);
      } finally {
        closeSync(file);
      }
      renameSync(temporaryPath, this.filePath);
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
  }

  listTasks(includeDeleted = false): Task[] {
    return this.read().tasks
      .filter((task) => includeDeleted || task.deletedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createTask(title: string): Task {
    const state = this.read();
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(), title, status: "to_do", createdAt: now,
      updatedAt: now, deletedAt: null,
    };
    state.tasks.push(task);
    this.write(state);
    return task;
  }

  updateStatus(id: string, target: Status, actorId: string, expectedStatus?: Status): { task: Task; changed: boolean } {
    const state = this.read();
    const task = state.tasks.find((item) => item.id === id && item.deletedAt === null);
    if (!task) throw new HttpError(404, "Task not found");
    if (task.status === target) return { task, changed: false };
    if (expectedStatus && task.status !== expectedStatus) {
      throw new HttpError(409, "Task status changed. Refresh and try again.");
    }
    if (STATUSES.indexOf(target) !== STATUSES.indexOf(task.status) + 1) {
      throw new HttpError(409, `Status must advance one step from ${task.status}`);
    }

    const now = new Date().toISOString();
    const log: AuditLog = {
      id: randomUUID(), sequence: state.nextSequence++, taskId: task.id,
      taskTitle: task.title, actorId, fromStatus: task.status,
      toStatus: target, createdAt: now,
    };
    task.status = target;
    task.updatedAt = now;
    state.auditLogs.push(log);
    this.write(state);
    return { task, changed: true };
  }

  deleteTask(id: string): Task {
    const state = this.read();
    const task = state.tasks.find((item) => item.id === id && item.deletedAt === null);
    if (!task) throw new HttpError(404, "Task not found");
    const now = new Date().toISOString();
    task.deletedAt = now;
    task.updatedAt = now;
    this.write(state);
    return task;
  }

  listAuditLogs(id: string): AuditLog[] {
    const state = this.read();
    if (!state.tasks.some((task) => task.id === id)) throw new HttpError(404, "Task not found");
    return state.auditLogs.filter((log) => log.taskId === id)
      .sort((a, b) => a.sequence - b.sequence);
  }
}
