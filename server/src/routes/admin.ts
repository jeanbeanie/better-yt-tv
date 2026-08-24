import express from "express";
import type { AuthedRequest } from "../auth/requireAuth.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requireAdmin } from "../auth/requireAdmin.js";
import {
  getQuotaHistory,
  getQuotaGroupsOnDate,
  getQuotaCallsInGroup,
  summarizeToday,
  YOUTUBE_QUOTA_CALL_TYPES,
} from "../youtube/quota.js";
import { getAppSettings, setRefreshPaused } from "../settings/appSettings.js";
import { createInvite, listInvites, deleteInvite, countUsers } from "../invites/invites.js";

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

// GET /api/admin/settings
adminRouter.get("/settings", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const settings = await getAppSettings();
    return res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/settings, body { refreshPaused: boolean }
adminRouter.patch("/settings", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const refreshPaused = req.body?.refreshPaused;
    if (typeof refreshPaused !== "boolean") {
      return res.status(400).json({ error: "refreshPaused must be a boolean" });
    }

    const userId = (req as AuthedRequest).userId;
    const settings = await setRefreshPaused(refreshPaused, userId);
    return res.json(settings);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/invites
adminRouter.get("/invites", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [invites, usersCount] = await Promise.all([listInvites(), countUsers()]);
    return res.json({ invites, usersCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/invites, body { note?: string | null }
adminRouter.post("/invites", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const note = req.body?.note;
    if (note !== undefined && note !== null && typeof note !== "string") {
      return res.status(400).json({ error: "note must be a string or null" });
    }

    const userId = (req as AuthedRequest).userId;
    const invite = await createInvite(note ?? null, userId);
    return res.json(invite);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/invites/:code, only removes an unused code
adminRouter.delete("/invites/:code", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const code = req.params.code;
    if (typeof code !== "string") {
      return res.status(400).json({ error: "code must be a string" });
    }

    const deleted = await deleteInvite(code);
    if (!deleted) {
      return res.status(404).json({ error: "Invite not found or already used" });
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
