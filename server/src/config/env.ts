// server/src/config/env.ts
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/config/env.ts -> repo root is ../../../
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

// validate required vars
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5179),

  DATABASE_URL: z.string().min(1),

  TOKEN_ENCRYPTION_KEY: z.string().min(16),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_CALLBACK_URL: z.string().url(),

  YOUTUBE_CACHE_TTL_MINUTES: z.coerce.number().int().positive().default(240),

  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173")
});

const parsedEnv = EnvSchema.parse(process.env);
const isSecureContext = new URL(parsedEnv.OAUTH_CALLBACK_URL).protocol === "https:";

// export typed env obj
export const env = {
  ...parsedEnv,
  isSecureContext,
  // SameSite=None is required for cookies to survive cross-site fetch() calls
  // (e.g. client and API on different subdomains) but browsers reject
  // SameSite=None without Secure, so this only flips once isSecureContext does
  cookieSameSite: isSecureContext ? ("none" as const) : ("lax" as const),
};
