import { rateLimit, type Options } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 20;

// shared by GET /login and GET /callback since they're one login flow
export function createAuthRateLimit(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests, please try again later" });
    },
    ...overrides,
  });
}

export const authRateLimit = createAuthRateLimit();
