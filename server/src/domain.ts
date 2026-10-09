export const STATUSES = ["to_do", "pending", "in_progress", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const ACTORS = [
  { id: "john.doe", name: "John Doe" },
  { id: "jane.smith", name: "Jane Smith" },
  { id: "alex.lee", name: "Alex Lee" },
] as const;

export interface Task {
  id: string;
  title: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AuditLog {
  id: string;
  sequence: number;
  taskId: string;
  taskTitle: string;
  actorId: string;
  fromStatus: Status;
  toStatus: Status;
  createdAt: string;
}

export interface State {
  tasks: Task[];
  auditLogs: AuditLog[];
  nextSequence: number;
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && STATUSES.includes(value as Status);
}

export function isActor(value: unknown): value is string {
  return typeof value === "string" && ACTORS.some((actor) => actor.id === value);
}
