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
  return typeof value === "object" && value !== null;
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
    if (typeof payload?.message === "string" && payload.message.length > 0) {
      message = payload.message;
    } else if (typeof payload?.error === "string" && payload.error.length > 0) {
      message = payload.error;
    }

    if (typeof payload?.code === "string" && payload.code.length > 0) {
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

export type User = {
  id: string;
  email: string | null;
  google_sub: string;
};

// get current user profile details
export async function getWhoAmI() {
  return apiFetch<{ user: User | null }>(
    "/api/auth/whoami",
    { method: "GET" },
    "whoami failed",
  );
}

// LOG OUT user with POST request
export async function logout() {
  return apiFetch<{ ok: boolean }>(
    "/api/auth/logout",
    { method: "POST" },
    "logout failed",
  );
}


  ///////////////////////////////
 //          YOUTUBE          //
///////////////////////////////

// Do a one-time sync from YouTube into the DB
export async function syncSubscriptions(): Promise<{ ok: boolean; syncedCount: number }> {
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

  return resp.json();
}


  ///////////////////////////////
 //          FEED             //
///////////////////////////////


export type FeedItem = {
  video_id: string;
  channel_id: string;
  channel_title: string;
  title: string;
  published_at: string;
  thumb_url: string | null;
  watched_at: string | null;
  is_watched: boolean;
};

export type PaginationParams = {
  offset?: number;
  limit?: number;
};

// turns offset/limit into a query string, leaves it out entirely when
// neither is given so callers dont need to think about it
function buildPaginationQuery(params?: PaginationParams): string {
  if (!params) return "";

  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));

  const query = search.toString();
  return query ? `?${query}` : "";
}

// Get current user's saved feed data from the backend
export async function getAllFeed(params?: PaginationParams) {
  return apiFetch<{ items: FeedItem[]; hasMore: boolean }>(
    `/api/feed/all${buildPaginationQuery(params)}`,
    { method: "GET" },
    "all feed failed",
  );
}

// Mark a specific video as watched for the current user
export async function markVideoWatched(videoId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/feed/videos/${videoId}/watch`,
    { method: "POST" },
    "mark watched failed",
  );
}

// Mark a specific video as not watched for the current user
export async function markVideoUnwatched(videoId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/feed/videos/${videoId}/unwatch`,
    { method: "POST" },
    "mark unwatched failed",
  );
}

  ///////////////////////////////
 //          CHANNELS         //
///////////////////////////////


// Fetch the current user's synced channels and their preferences
export async function getChannels() {
  return apiFetch<{
    // TODO make exportable types for reuse????
    channels: Array<{
      channelId: string;
      title: string;
      thumbUrl: string | null;
      enabledAll: boolean;
      enabledLive: boolean;
      excludedShorts: boolean;
    }>;
  }>(
    "/api/channels",
    { method: "GET" },
    "get channels failed",
  );

}

// TODO move types into their own file
type ChannelPreferencePatch = {
  enabledAll?: boolean;
  enabledLive?: boolean;
  excludedShorts?: boolean;
};

// Update current user preferences for one channel
export async function updateChannel(
  channelId: string,
  updates: ChannelPreferencePatch,
) {
  return apiFetch<{ ok?: boolean }>(
    `/api/channels/${channelId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    },
    "update channel failed",
  );
}

type BulkChannelPreferencePatch = ChannelPreferencePatch & {
  channelIds: string[];
};

// Update one preference field across many channels in a single request
export async function bulkUpdateChannels(updates: BulkChannelPreferencePatch) {
  return apiFetch<{ ok: boolean; updatedCount: number }>(
    "/api/channels/bulk",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    },
    "bulk update channels failed",
  );
}

  ///////////////////////////////
 //          LISTS            //
///////////////////////////////

export type ListSummary = {
  id: string;
  name: string;
  channelCount: number;
  createdAt: string;
  updatedAt: string;
};

// Fetch all lists for the current user, with a channel count for each
export async function getLists() {
  return apiFetch<{ lists: ListSummary[] }>(
    "/api/lists",
    { method: "GET" },
    "get lists failed",
  );
}

export type ListChannel = {
  channelId: string;
  title: string;
  thumbUrl: string | null;
};

export type ListDetail = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  channelIds: string[];
  channels: ListChannel[];
};

// Create a new empty list
export async function createList(name: string) {
  return apiFetch<{ list: ListDetail }>(
    "/api/lists",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    },
    "create list failed",
  );
}

// Load one list and its current channel membership, for the editor page
export async function getList(listId: string) {
  return apiFetch<{ list: ListDetail }>(
    `/api/lists/${listId}`,
    { method: "GET" },
    "get list failed",
  );
}

export type SaveListInput = {
  name: string;
  channelIds: string[];
};

// Save the full editor state in one request: rename the list and replace
// its channel membership
export async function saveList(listId: string, input: SaveListInput) {
  return apiFetch<{ list: ListDetail }>(
    `/api/lists/${listId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
    "save list failed",
  );
}

// Delete a list
export async function deleteList(listId: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/lists/${listId}`,
    { method: "DELETE" },
    "delete list failed",
  );
}

// Get the video feed for a specific list (ignores enabled_all, respects
// excluded_shorts and watched state, same as getAllFeed)
export async function getListFeed(listId: string, params?: PaginationParams) {
  return apiFetch<{ list: { id: string; name: string }; items: FeedItem[]; hasMore: boolean }>(
    `/api/feed/lists/${listId}${buildPaginationQuery(params)}`,
    { method: "GET" },
    "get list feed failed",
  );
}
