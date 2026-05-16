import express from "express";
import { env } from "./config/env.js";

const app = express();
app.use(express.json());

app.get("/api/test", (_req, res) => {
  res.json({ ok: true });
});

const port = env.PORT;

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
