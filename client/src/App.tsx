import { useEffect, useRef, useState, type FormEvent } from "react";

const statuses = ["to_do", "pending", "in_progress", "done"] as const;
type Status = (typeof statuses)[number];
type Task = {
  id: string;
  title: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
type AuditLog = {
  id: string;
  sequence: number;
  taskId: string;
  taskTitle: string;
  actorId: string;
  fromStatus: Status;
  toStatus: Status;
  createdAt: string;
};
type Actor = { id: string; name: string };

const labels: Record<Status, string> = {
  to_do: "To do", pending: "Pending", in_progress: "In progress", done: "Done",
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [actorId, setActorId] = useState("john.doe");
  const [title, setTitle] = useState("");
  const [view, setView] = useState<"active" | "deleted">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const historyRequest = useRef(0);

  async function refreshTasks() {
    setTasks(await api<Task[]>("/tasks?includeDeleted=true"));
  }

  useEffect(() => {
    Promise.all([api<Task[]>("/tasks?includeDeleted=true"), api<Actor[]>("/actors")])
      .then(([taskData, actorData]) => {
        setTasks(taskData);
        setActors(actorData);
        if (actorData.length) setActorId(actorData[0].id);
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadHistory(taskId: string) {
    const requestNumber = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const data = await api<AuditLog[]>(`/tasks/${taskId}/audit-logs`);
      if (requestNumber === historyRequest.current) setLogs(data);
    } catch (cause) {
      if (requestNumber === historyRequest.current) setError((cause as Error).message);
    } finally {
      if (requestNumber === historyRequest.current) setHistoryLoading(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setError("");
    setCreating(true);
    try {
      await api<Task>("/tasks", { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      setView("active");
      await refreshTasks();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function advance(task: Task) {
    const next = statuses[statuses.indexOf(task.status) + 1];
    if (!next) return;
    setError("");
    setBusyId(task.id);
    try {
      await api(`/tasks/${task.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: next, actorId, expectedStatus: task.status }),
      });
      await refreshTasks();
      if (expandedId === task.id) await loadHistory(task.id);
    } catch (cause) {
      setError((cause as Error).message);
      await refreshTasks().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? Its history will remain available under Deleted.`)) return;
    setError("");
    setBusyId(task.id);
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      await refreshTasks();
      setExpandedId(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleHistory(taskId: string) {
    if (expandedId === taskId) {
      historyRequest.current++;
      setExpandedId(null);
      return;
    }
    setExpandedId(taskId);
    setLogs([]);
    void loadHistory(taskId);
  }

  const visibleTasks = tasks.filter((task) => view === "deleted" ? task.deletedAt : !task.deletedAt);
  const activeCount = tasks.filter((task) => !task.deletedAt).length;
  const deletedCount = tasks.length - activeCount;

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-mark" aria-hidden="true">TL</div>
        <div>
          <p className="eyebrow">Internal workspace</p>
          <h1>Task Ledger</h1>
        </div>
      </header>

      <section className="intro" aria-labelledby="intro-title">
        <div>
          <p className="eyebrow">Overview</p>
          <h2 id="intro-title">A clear record of every step.</h2>
          <p>Create tasks, move them forward, and see who changed each status.</p>
        </div>
        <div className="actor-control">
          <label htmlFor="actor">Acting as</label>
          <select id="actor" value={actorId} onChange={(event) => setActorId(event.target.value)} disabled={!actors.length}>
            {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name} ({actor.id})</option>)}
          </select>
        </div>
      </section>

      <section className="create-section" aria-labelledby="create-title">
        <div className="section-heading">
          <h2 id="create-title">New task</h2>
          <span>Starts at To do</span>
        </div>
        <form className="create-form" onSubmit={createTask}>
          <label className="sr-only" htmlFor="task-title">Task title</label>
          <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" maxLength={120} required />
          <button className="primary-button" disabled={creating}>{creating ? "Adding…" : "Add task"}</button>
        </form>
      </section>

      <section className="task-section" aria-labelledby="tasks-title">
        <div className="section-heading task-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2 id="tasks-title">Tasks</h2>
          </div>
          <div className="tabs" role="group" aria-label="Task view">
            <button className={view === "active" ? "selected" : ""} onClick={() => { setView("active"); setExpandedId(null); }} aria-pressed={view === "active"}>Active <span>{activeCount}</span></button>
            <button className={view === "deleted" ? "selected" : ""} onClick={() => { setView("deleted"); setExpandedId(null); }} aria-pressed={view === "deleted"}>Deleted <span>{deletedCount}</span></button>
          </div>
        </div>

        {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {loading ? <p className="empty-state">Loading tasks…</p> : visibleTasks.length === 0 ? (
          <div className="empty-state">
            <strong>{view === "active" ? "No active tasks yet" : "No deleted tasks"}</strong>
            <p>{view === "active" ? "Add a task above to start tracking its progress." : "Deleted tasks and their history will appear here."}</p>
          </div>
        ) : (
          <div className="task-list">
            {visibleTasks.map((task) => {
              const next = statuses[statuses.indexOf(task.status) + 1];
              return <article className="task-item" key={task.id}>
                <div className="task-main">
                  <div className="task-copy">
                    <span className={`status-dot status-${task.status}`} aria-hidden="true" />
                    <div>
                      <h3>{task.title}</h3>
                      <p>Created {readableDate(task.createdAt)}{task.deletedAt ? ` · Deleted ${readableDate(task.deletedAt)}` : ""}</p>
                    </div>
                  </div>
                  <div className="task-actions">
                    <span className={`status-label status-${task.status}`}>{labels[task.status]}</span>
                    {view === "active" && next && <button className="advance-button" disabled={busyId === task.id || !actors.length} onClick={() => void advance(task)}>{busyId === task.id ? "Saving…" : `Move to ${labels[next]}`}</button>}
                    {view === "active" && <button className="icon-button" disabled={busyId === task.id} onClick={() => void remove(task)} aria-label={`Delete ${task.title}`} title="Delete task">×</button>}
                  </div>
                </div>
                <button className="history-toggle" onClick={() => toggleHistory(task.id)} aria-expanded={expandedId === task.id} aria-controls={`history-${task.id}`}>
                  <span aria-hidden="true">{expandedId === task.id ? "▾" : "▸"}</span> {expandedId === task.id ? "Hide history" : "View history"}
                </button>
                {expandedId === task.id && <div className="history-panel" id={`history-${task.id}`}>
                  {historyLoading ? <p>Loading history…</p> : logs.length === 0 ? <p>No status changes yet.</p> : (
                    <ol className="history-list">
                      {logs.map((log) => <li key={log.id}>
                        <span className="history-marker" aria-hidden="true" />
                        <div><strong>{log.actorId}</strong> moved this task from <strong>{labels[log.fromStatus]}</strong> to <strong>{labels[log.toStatus]}</strong><time dateTime={log.createdAt}>{readableDate(log.createdAt)}</time></div>
                      </li>)}
                    </ol>
                  )}
                </div>}
              </article>;
            })}
          </div>
        )}
      </section>
      <footer>Every status change is recorded in order. Deleted tasks keep their history.</footer>
    </main>
  );
}
