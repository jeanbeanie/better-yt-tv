import express from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import { getQuotaHistory, getQuotaCallsOnDate, summarizeToday } from "../youtube/quota.js";

export const adminRouter = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// GET /api/admin/quota
// Today's estimated YouTube Data API quota usage plus recent history
adminRouter.get("/quota", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const { days, todayDate } = await getQuotaHistory();
    const today = summarizeToday(days, todayDate);
    return res.json({ today, history: days });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/quota/calls?date=YYYY-MM-DD
// Individual quota-consuming calls logged on one pacific calendar date
adminRouter.get("/quota/calls", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const date = req.query.date;
    if (typeof date !== "string" || !isValidDate(date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    }

    const calls = await getQuotaCallsOnDate(date);
    return res.json({ date, calls });
  } catch (err) {
    next(err);
  }
});
