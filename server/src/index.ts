import { resolve } from "node:path";
import { createApp } from "./app.js";
import { FileTaskStore } from "./store.js";

const port = Number(process.env.PORT ?? 3001);
const dataFile = resolve(process.env.DATA_FILE ?? "data/tasks.json");
const app = createApp(new FileTaskStore(dataFile));
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
