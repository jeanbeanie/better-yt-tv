import { Fragment, useEffect, useState } from "react";
import {
  getQuotaSummary,
  getQuotaCallsForDate,
  getLoginUrl,
  ApiError,
  type QuotaSummary,
  type QuotaHistoryDay,
  type QuotaCall,
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

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [callsByDate, setCallsByDate] = useState<Record<string, QuotaCall[]>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [callErrors, setCallErrors] = useState<Record<string, string>>({});

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

  // lazy-loads a day's individual calls on first expand, caches on success,
  // and clears any error on collapse so re-expanding retries a transient failure
  async function toggleDate(date: string) {
    if (expandedDates.has(date)) {
      setExpandedDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
      setCallErrors((prev) => {
        if (!(date in prev)) return prev;
        const next = { ...prev };
        delete next[date];
        return next;
      });
      return;
    }

    setExpandedDates((prev) => new Set(prev).add(date));

    if (callsByDate[date] || loadingDates.has(date)) return;

    setLoadingDates((prev) => new Set(prev).add(date));
    try {
      const data = await getQuotaCallsForDate(date);
      setCallsByDate((prev) => ({ ...prev, [date]: data.calls }));
    } catch (err) {
      setCallErrors((prev) => ({
        ...prev,
        [date]: err instanceof Error ? err.message : "Failed to load calls",
      }));
    } finally {
      setLoadingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }

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
                    {history.map((day) => {
                      const isExpanded = expandedDates.has(day.date);
                      const isLoading = loadingDates.has(day.date);
                      const dayError = callErrors[day.date];
                      const calls = callsByDate[day.date];

                      return (
                        <Fragment key={day.date}>
                          <tr>
                            <td
                              onClick={() => void toggleDate(day.date)}
                              style={{
                                padding: "0.5rem",
                                borderBottom: "1px solid var(--border)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                              }}
                            >
                              <button
                                type="button"
                                title={isExpanded ? "Collapse" : "Expand"}
                                aria-expanded={isExpanded}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--accent)",
                                  fontSize: "0.7rem",
                                  lineHeight: 1,
                                  padding: 0,
                                }}
                              >
                                {isExpanded ? "▾" : "▴"}
                              </button>
                              {day.date}
                            </td>
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
                          {isExpanded && (
                            <tr>
                              <td
                                colSpan={callTypes.length + 2}
                                style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)" }}
                              >
                                {isLoading && <Spinner label="Loading calls..." />}
                                {dayError && <ErrorText>{dayError}</ErrorText>}
                                {!isLoading && !dayError && calls && calls.length === 0 && (
                                  <MutedText>No calls recorded.</MutedText>
                                )}
                                {!isLoading && !dayError && calls && calls.length > 0 && (
                                  <div style={{ display: "grid", gap: "0.25rem" }}>
                                    {calls.map((call, index) => (
                                      <div
                                        key={`${call.calledAt}-${call.callType}-${index}`}
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: "1rem",
                                          fontSize: "0.85rem",
                                        }}
                                      >
                                        <span>
                                          {new Date(call.calledAt).toLocaleTimeString("en-US", {
                                            timeZone: "America/Los_Angeles",
                                            hour: "numeric",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                        <span>{call.callType}</span>
                                        <MutedText>{call.units.toLocaleString()} units</MutedText>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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
