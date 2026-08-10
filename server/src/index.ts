import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();
const port = env.PORT;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
