// server/src/config/env.ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/config/env.ts -> repo root is ../../../
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// validate required vars
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5179),

  DATABASE_URL: z.string().min(1),

  TOKEN_ENCRYPTION_KEY: z.string().min(16),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_CALLBACK_URL: z.string().url(),

  YOUTUBE_CACHE_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173")
});

// export typed env obj
export const env = EnvSchema.parse(process.env);
