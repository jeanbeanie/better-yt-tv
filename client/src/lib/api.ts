// todo get from env
const API_BASE = "http://localhost:5179";

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
