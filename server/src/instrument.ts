import * as Sentry from "@sentry/node";
import { APP_VERSION } from "./lib/appVersion.js";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  initialScope: { tags: { app_version: APP_VERSION } },
});
