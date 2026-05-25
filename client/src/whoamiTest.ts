export async function whoami() {
  const resp = await fetch("http://localhost:5179/api/auth/whoami", {
    credentials: "include",
  });
  return resp.json();
}
