const API_BASE = import.meta.env.VITE_API_BASE_URL;

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

// returns URL string users needs to login
export function getLoginUrl() {
  return `${API_BASE}/api/auth/login`;
}

// Get current user's saved feed data from the backend
export async function getAllFeed() {
  const resp = await fetch(`${API_BASE}/api/feed/all`, {
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`all feed failed: ${resp.status}`);
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
    throw new Error(`sync subscriptions failed: ${resp.status}`);
  }

  return resp.json();
}

// Trigger refresh of recent videos into videos_cache
export async function refreshAllCache() {
  const resp = await fetch(`${API_BASE}/api/youtube/refresh-all-cache`, {
    method: "POST",
    credentials: "include",
  });

  if (!resp.ok) {
    throw new Error(`refresh all cache failed: ${resp.status}`);
  }

  return resp.json();
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
