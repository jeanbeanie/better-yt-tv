type BuildAuthUrlArgs = {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string[];
};

export function buildGoogleAuthUrl(args: BuildAuthUrlArgs) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", args.state);
  url.searchParams.set("scope", args.scope.join(" "));
  return url.toString();
}

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

  const json = (await resp.json()) as any;
  const expires_at =
    typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : undefined;

  return { ...json, expires_at };
}

export function getGoogleUserFromIdToken(idToken: string): { sub: string; email?: string } {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token format");

  const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson);

  if (!payload.sub) throw new Error("id_token missing sub");
  return { sub: String(payload.sub), email: payload.email ? String(payload.email) : undefined };
}
