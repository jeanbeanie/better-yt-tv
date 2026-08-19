import express from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import { getQuotaHistory, summarizeToday } from "../youtube/quota.js";

export const adminRouter = express.Router();

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
