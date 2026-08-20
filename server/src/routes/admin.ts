import express from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  getQuotaHistory,
  getQuotaGroupsOnDate,
  getQuotaCallsInGroup,
  summarizeToday,
  YOUTUBE_QUOTA_CALL_TYPES,
} from "../youtube/quota.js";

export const adminRouter = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// missing param means null
function optionalQueryParam(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

// GET /api/admin/quota/groups?date=YYYY-MM-DD
// Quota calls on one pacific calendar date, grouped by action, call type, user, and run
adminRouter.get("/quota/groups", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const date = req.query.date;
    if (typeof date !== "string" || !isValidDate(date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    }

    const groups = await getQuotaGroupsOnDate(date);
    return res.json({ date, groups });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/quota/group-calls?date=&callType=&action=&userId=&requestGroupId=
// Raw calls inside one group. action/userId/requestGroupId are optional, absent means null
adminRouter.get("/quota/group-calls", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const date = req.query.date;
    if (typeof date !== "string" || !isValidDate(date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
    }

    const callType = req.query.callType;
    if (
      typeof callType !== "string" ||
      !(YOUTUBE_QUOTA_CALL_TYPES as readonly string[]).includes(callType)
    ) {
      return res.status(400).json({
        error: `callType must be one of ${YOUTUBE_QUOTA_CALL_TYPES.join(", ")}`,
      });
    }

    const calls = await getQuotaCallsInGroup({
      date,
      callType,
      action: optionalQueryParam(req.query.action),
      userId: optionalQueryParam(req.query.userId),
      requestGroupId: optionalQueryParam(req.query.requestGroupId),
    });
    return res.json({ date, calls });
  } catch (err) {
    next(err);
  }
});
