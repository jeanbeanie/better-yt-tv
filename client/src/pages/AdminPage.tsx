import { useEffect, useState } from "react";
import {
  getQuotaSummary,
  getLoginUrl,
  ApiError,
  type QuotaSummary,
  type QuotaHistoryDay,
} from "../lib/api";
import ErrorText from "../components/ErrorText";
import MutedText from "../components/MutedText";
import Spinner from "../components/Spinner";

export default function AdminPage() {
  const [today, setToday] = useState<QuotaSummary | null>(null);
  const [history, setHistory] = useState<QuotaHistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);

  useEffect(() => {
    if (!pendingLoginRedirect) return;
    window.location.assign(getLoginUrl());
  }, [pendingLoginRedirect]);

  async function loadQuota() {
    try {
      setLoading(true);
      setError(null);
      setNotAuthorized(false);

      const data = await getQuotaSummary();
      setToday(data.today);
      setHistory(data.history);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code === "AUTH_REQUIRED") {
        setError("Your session expired. Redirecting to sign in...");
        setPendingLoginRedirect(true);
        return;
      }
      if (err instanceof ApiError && err.status === 403 && err.code === "ADMIN_REQUIRED") {
        setNotAuthorized(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load quota usage");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuota();
  }, []);

  const usedPct = today ? Math.min(100, Math.round((today.used / today.budget) * 100)) : 0;
  const callTypes = [...new Set(history.flatMap((d) => d.breakdown.map((b) => b.callType)))].sort();

  return (
    <main style={{ maxWidth: "700px", margin: "0 auto", display: "grid", gap: "1.5rem" }}>
      <header>
        <h1 style={{ marginBottom: "0.5rem" }}>Admin</h1>
      </header>

      {loading && <Spinner label="Loading quota usage..." />}
      {error && <ErrorText>{error}</ErrorText>}

      {!loading && notAuthorized && (
        <ErrorText>
          You are not authorized to view this page.
        </ErrorText>
      )}

      {!loading && !error && !notAuthorized && today && (
        <>
          <section
            style={{
              display: "grid",
              gap: "0.5rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{today.used.toLocaleString()} estimated used today</span>
              <MutedText>
                {today.remaining.toLocaleString()} estimated remaining of {today.budget.toLocaleString()}
              </MutedText>
            </div>
            <div
              style={{
                height: "10px",
                borderRadius: "999px",
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${usedPct}%`,
                  background: usedPct >= 90 ? "var(--danger)" : "var(--accent)",
                }}
              />
            </div>
            <MutedText style={{ fontSize: "0.75rem" }}>
              Estimated YouTube API quota usage, tracked locally. Resets daily at midnight Pacific.
            </MutedText>
          </section>

          {today.breakdown.length > 0 && (
            <section style={{ display: "grid", gap: "0.5rem" }}>
              <h2>Usage by Call Type (Today)</h2>
              {today.breakdown.map((row) => (
                <div
                  key={row.callType}
                  className="divider-row"
                  style={{ justifyContent: "space-between", padding: "0.5rem 0" }}
                >
                  <span>{row.callType}</span>
                  <MutedText>{row.units.toLocaleString()} units</MutedText>
                </div>
              ))}
            </section>
          )}

          {history.length > 0 && (
            <section style={{ display: "grid", gap: "0.5rem" }}>
              <h2>Historical Usage</h2>
              <MutedText>Last 365 Days</MutedText>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: "0.5rem" }}>
                        Date
                      </th>
                      {callTypes.map((ct) => (
                        <th
                          key={ct}
                          style={{ textAlign: "right", borderBottom: "1px solid var(--border)", padding: "0.5rem" }}
                        >
                          {ct}
                        </th>
                      ))}
                      <th style={{ textAlign: "right", borderBottom: "1px solid var(--border)", padding: "0.5rem" }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((day) => (
                      <tr key={day.date}>
                        <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>{day.date}</td>
                        {callTypes.map((ct) => (
                          <td
                            key={ct}
                            style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid var(--border)" }}
                          >
                            {day.breakdown.find((b) => b.callType === ct)?.units ?? 0}
                          </td>
                        ))}
                        <td style={{ textAlign: "right", padding: "0.5rem", borderBottom: "1px solid var(--border)" }}>
                          {day.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
