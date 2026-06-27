const API_BASE = import.meta.env.VITE_API_BASE_URL;

// extend built-in Error class
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiErrorPayload = {
  message?: string;
  error?: string;
  code?: string;
};

// type guard
function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value == "object" || value !== null;
}

  //////////////////////////
 //  HELPER FUNCTIONS    //
//////////////////////////

// try to extract something useful from error regardless of error shape
async function parseApiError(resp: Response, fallback: string): Promise<ApiError> {
  let payload: unknown;

  try {
    payload = await resp.json();
  } catch {
    payload = null;
  }

  let message = `${fallback}: ${resp.status}`;
  let code: string | undefined;

  if (isApiErrorPayload(payload)) {
    if (typeof payload.message === "string" && payload.message.length > 0) {
      message = payload.message;
    } else if (typeof payload.error === "string" && payload.error.length > 0) {
      message = payload.error;
    }

    if (typeof payload.code === "string" && payload.code.length > 0) {
      code = payload.code;
    }
  }

  return new ApiError(message, resp.status, code);
}

// reusable wrapper for endpoints
async function apiFetch<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init, // method, headers, body, etc...
  });

  if (!resp.ok) {
    throw await parseApiError(resp, fallback);
  }

  return (await resp.json()) as T;
}

// returns URL string users needs to login
export function getLoginUrl() {
  return `${API_BASE}/api/auth/login`;
}

export function shouldRedirectToLogin(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 401 &&
    (err.code === "AUTH_REQUIRED" || err.code === "YOUTUBE_REAUTH_REQUIRED")
  );
}


  ///////////////////////////////
 //          AUTH             //
///////////////////////////////


// get current user profile details
export async function getWhoAmI() {
  const resp = await fetch(`${API_BASE}/api/auth/whoami`, {
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`whoami failed: ${resp.status}`);
  }

  return resp.json();
}

// LOG OUT user with POST request
export async function logout() {
  const resp = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`logout failed: ${resp.status}`);
  }

  return resp.json();
}


  ///////////////////////////////
 //          YOUTUBE          //
///////////////////////////////

// get user YouTube channel subscriptions
export async function getSubscriptions() {
  const resp = await fetch(`${API_BASE}/api/youtube/subscriptions`, {
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`subscriptions failed: ${resp.status}`);
  }

  return resp.json();
}


// Do a one-time sync from YouTube into the DB
export async function syncSubscriptions() {
  const resp = await fetch(`${API_BASE}/api/youtube/sync-subscriptions`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    throw await parseApiError(resp, "sync subscriptions failed");
  }

  return resp.json();
}

export async function refreshAllCache() {
  const resp = await fetch(`${API_BASE}/api/youtube/refresh-all-cache`, {
    method: "POST",
    credentials: "include", // tells browser to send cookies with this request, necessary for auth
  });

  if (!resp.ok) {
    throw await parseApiError(resp, "refresh all cache failed");
  }

  return resp.json
}


  ///////////////////////////////
 //          FEED             //
///////////////////////////////


// Get current user's saved feed data from the backend
export async function getAllFeed() {
  return apiFetch<{ items: unknown[] }>(
    "/api/feed/all",
    { method: "GET" },
    "all feed failed",
  );
}

// Mark a specific video as watched for the current user
export async function markVideoWatched(videoId: string) {
  const resp = await fetch(`${API_BASE}/api/feed/videos/${videoId}/watch`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`mark watched failed: ${resp.status}`);
  }

  return resp.json();
}

// Mark a specific video as not watched for the current user
export async function markVideoUnwatched(videoId: string) {
  const resp = await fetch(`${API_BASE}/api/feed/videos/${videoId}/unwatch`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`mark unwatched failed: ${resp.status}`);
  }

  return resp.json();
}

  ///////////////////////////////
 //          CHANNELS         //
///////////////////////////////


// Fetch the current user's synced channels and their preferences
export async function getChannels() {
  const resp = await fetch(`${API_BASE}/api/channels`, {
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`get channels failed: ${resp.status}`);
  }

  return resp.json();
}

// TODO move types into their own file
type UpdateChannelPreferencesInput = {
  enabledAll?: boolean;
  enabledLive?: boolean;
  excludedShorts?: boolean;
};

// Update current user preferences for one channel
export async function updateChannel(
  channelId: string,
  updates: UpdateChannelPreferencesInput,
) {
  const resp = await fetch(`${API_BASE}/api/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(updates),
  });

  if (!resp.ok) {
    throw new Error(`update channel failed: ${resp.status}`);
  }

  return resp.json();
}
