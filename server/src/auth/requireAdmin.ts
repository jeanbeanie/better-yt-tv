import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./requireAuth.js";

// sync, no db call: requireAuth already attached isAdmin from its join
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req as AuthedRequest).isAdmin) {
    return res.status(403).json({
      code: "ADMIN_REQUIRED",
      message: "You are not authorized to view this page.",
    });
  }

  return next();
}
