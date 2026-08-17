import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

const oauthClient = new OAuth2Client();

type BuildAuthUrlArgs = {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string[];
};

// generate initial login link for the user
export function buildGoogleAuthUrl(args: BuildAuthUrlArgs) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code"); // return auth code after login
  url.searchParams.set("access_type", "offline"); // request refresh_token
  url.searchParams.set("prompt", "consent"); // force screen where user grants permissions
  url.searchParams.set("state", args.state);
  url.searchParams.set("scope", args.scope.join(" "));
  return url.toString();
}

// swaps temp authorization code with access tokens
export async function exchangeCodeForTokens(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  expires_at?: number;
}> {
  const body = new URLSearchParams();
  body.set("code", args.code);
  body.set("client_id", args.clientId);
  body.set("client_secret", args.clientSecret);
  body.set("redirect_uri", args.redirectUri);
  body.set("grant_type", "authorization_code");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  // wait for access token from Google and return with calcualted expires_at timestamp
  const json = (await resp.json()) as any;
  const expires_at =
    typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : undefined;

  return { ...json, expires_at };
}

// verify id_token signature/aud/iss/exp against Google, then grab user details
export async function getGoogleUserFromIdToken(
  idToken: string,
): Promise<{ sub: string; email?: string }> {
  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  // return user's unique Google ID and email
  if (!payload?.sub) throw new Error("id_token missing sub");
  return { sub: payload.sub, email: payload.email };
}

// re-establish access after prev access token expires with a refresh token
export async function refreshAccessToken(args: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ access_token: string; expires_in: number; expires_at: number }> {
  const body = new URLSearchParams();
  body.set("client_id", args.clientId);
  body.set("client_secret", args.clientSecret);
  body.set("refresh_token", args.refreshToken);
  body.set("grant_type", "refresh_token");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Refresh failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as any;
  const expires_at = Date.now() + Number(json.expires_in) * 1000;
  return { access_token: String(json.access_token), expires_in: Number(json.expires_in), expires_at };
}
