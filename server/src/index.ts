import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

const app = createApp();
const port = env.PORT;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

// one time check, not gating the healthcheck, just surfaces a clear error
// instead of every db query failing if DATABASE_URL is wrong
pool.query("select 1").catch((err) => {
  console.error("Database connection check failed:", err.message);
});
