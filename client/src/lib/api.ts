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

const INVITE_CODE_STORAGE_KEY = "betterYtTv.inviteCode";

export function saveInviteCode(code: string) {
  window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, code);
}

// returns URL string users needs to login, attaching a remembered invite
// code if one is saved
export function getLoginUrl() {
  const inviteCode = window.localStorage.getItem(INVITE_CODE_STORAGE_KEY);
  const query = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : "";
  return `${API_BASE}/api/auth/login${query}`;
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
  is_admin: boolean;
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

export type RefreshAllCacheResult = {
  ok: true;
  refreshPaused: boolean;
  refreshedChannels: number;
  skippedChannels: number;
  failedChannels: number;
  cachedVideos: number;
};

// tracks the request already in flight, so a second call while one
// is pending shares it instead of firing a duplicate refresh
let refreshAllCacheInFlight: Promise<RefreshAllCacheResult> | null = null;

export async function refreshAllCache(): Promise<RefreshAllCacheResult> {
  if (refreshAllCacheInFlight) return refreshAllCacheInFlight;

  const inFlight = (async () => {
    const resp = await fetch(`${API_BASE}/api/youtube/refresh-all-cache`, {
      method: "POST",
      credentials: "include", // tells browser to send cookies with this request, necessary for auth
    });

    if (!resp.ok) {
      throw await parseApiError(resp, "refresh all cache failed");
    }

    return resp.json();
  })();

  refreshAllCacheInFlight = inFlight;
  try {
    return await inFlight;
  } finally {
    // only clear if a newer call hasnt already replaced it
    if (refreshAllCacheInFlight === inFlight) refreshAllCacheInFlight = null;
  }
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

  ///////////////////////////////
 //          ADMIN            //
///////////////////////////////

export type QuotaBreakdownEntry = { callType: string; units: number };

export type QuotaSummary = {
  used: number;
  remaining: number;
  budget: number;
  breakdown: QuotaBreakdownEntry[];
};

export type QuotaHistoryDay = {
  date: string;
  total: number;
  breakdown: QuotaBreakdownEntry[];
};

// Get today's estimated YouTube Data API quota usage plus recent history
export async function getQuotaSummary() {
  return apiFetch<{ today: QuotaSummary; history: QuotaHistoryDay[] }>(
    "/api/admin/quota",
    { method: "GET" },
    "get quota summary failed",
  );
}

export type QuotaCall = { calledAt: string; callType: string; units: number };

export type QuotaActionGroup = {
  action: string | null;
  callType: string;
  units: number;
  requestGroupId: string | null;
  userEmail: string | null;
  firstAt: string;
  lastAt: string;
};

// Get the quota calls logged on one pacific calendar date (YYYY-MM-DD),
// grouped by action, call type, user, and run
export async function getQuotaGroupsForDate(date: string) {
  return apiFetch<{ date: string; groups: QuotaActionGroup[] }>(
    `/api/admin/quota/groups?date=${date}`,
    { method: "GET" },
    "get quota groups failed",
  );
}

// Get the raw calls within one group.
//left out of the query when null
export async function getQuotaGroupCalls(args: {
  date: string;
  callType: string;
  action: string | null;
  userId: string | null;
  requestGroupId: string | null;
}) {
  const params = new URLSearchParams({ date: args.date, callType: args.callType });
  if (args.action !== null) params.set("action", args.action);
  if (args.userId !== null) params.set("userId", args.userId);
  if (args.requestGroupId !== null) params.set("requestGroupId", args.requestGroupId);

  return apiFetch<{ date: string; calls: QuotaCall[] }>(
    `/api/admin/quota/group-calls?${params.toString()}`,
    { method: "GET" },
    "get quota group calls failed",
  );
}

export type AppSettings = {
  refreshPaused: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export async function getAppSettings() {
  return apiFetch<AppSettings>("/api/admin/settings", { method: "GET" }, "get app settings failed");
}

export async function updateAppSettings(args: { refreshPaused: boolean }) {
  return apiFetch<AppSettings>(
    "/api/admin/settings",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    },
    "update app settings failed",
  );
}

export type Invite = {
  code: string;
  note: string | null;
  createdAt: string;
  usedAt: string | null;
  usedByEmail: string | null;
};

export async function getInvites() {
  return apiFetch<{ invites: Invite[]; usersCount: number }>(
    "/api/admin/invites",
    { method: "GET" },
    "get invites failed",
  );
}

export async function createInvite(note: string | null) {
  return apiFetch<Invite>(
    "/api/admin/invites",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note }),
    },
    "create invite failed",
  );
}

export async function deleteInvite(code: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/invites/${encodeURIComponent(code)}`,
    { method: "DELETE" },
    "delete invite failed",
  );
}
