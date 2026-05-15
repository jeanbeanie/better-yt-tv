import express from "express";

const app = express();
app.use(express.json());

app.get("/api/test", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 5179);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
