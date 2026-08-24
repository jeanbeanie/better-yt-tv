import { Fragment, useEffect, useState } from "react";
import {
  getQuotaSummary,
  getQuotaGroupsForDate,
  getQuotaGroupCalls,
  getAppSettings,
  updateAppSettings,
  getInvites,
  createInvite,
  deleteInvite,
  getLoginUrl,
  ApiError,
  type QuotaSummary,
  type QuotaHistoryDay,
  type QuotaCall,
  type QuotaActionGroup,
  type AppSettings,
  type Invite,
} from "../lib/api";
import ErrorText from "../components/ErrorText";
import MutedText from "../components/MutedText";
import Spinner from "../components/Spinner";

function formatPacificTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupKey(date: string, group: QuotaActionGroup) {
  return `${date}|${group.callType}|${group.action ?? ""}|${group.requestGroupId ?? ""}`;
}

export default function AdminPage() {
  const [today, setToday] = useState<QuotaSummary | null>(null);
  const [history, setHistory] = useState<QuotaHistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAuthorized, setNotAuthorized] = useState(false);
  const [pendingLoginRedirect, setPendingLoginRedirect] = useState(false);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [justCreated, setJustCreated] = useState<Invite | null>(null);
  const [deletingCodes, setDeletingCodes] = useState<Set<string>>(new Set());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [groupsByDate, setGroupsByDate] = useState<Record<string, QuotaActionGroup[]>>({});
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [dayErrors, setDayErrors] = useState<Record<string, string>>({});

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [callsByGroup, setCallsByGroup] = useState<Record<string, QuotaCall[]>>({});
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});

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

  // separate from loadQuota so a settings failure doesnt block quota
  // display, or vice versa
  async function loadSettings() {
    try {
      const data = await getAppSettings();
      setSettings(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code === "AUTH_REQUIRED") {
        setPendingLoginRedirect(true);
        return;
      }
      if (err instanceof ApiError && err.status === 403 && err.code === "ADMIN_REQUIRED") {
        setNotAuthorized(true);
        return;
      }
      setSettingsError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadInvites() {
    try {
      const data = await getInvites();
      setInvites(data.invites);
      setUsersCount(data.usersCount);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code === "AUTH_REQUIRED") {
        setPendingLoginRedirect(true);
        return;
      }
      if (err instanceof ApiError && err.status === 403 && err.code === "ADMIN_REQUIRED") {
        setNotAuthorized(true);
        return;
      }
      setInvitesError(err instanceof Error ? err.message : "Failed to load invites");
    }
  }

  useEffect(() => {
    void loadInvites();
  }, []);

  function inviteLink(code: string) {
    return `${window.location.origin}/?invite=${code}`;
  }

  async function handleCreateInvite() {
    setInvitesError(null);
    setCreatingInvite(true);
    try {
      const invite = await createInvite(noteInput.trim() || null);
      setInvites((prev) => [invite, ...prev]);
      setJustCreated(invite);
      setNoteInput("");
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleDeleteInvite(code: string) {
    setDeletingCodes((prev) => new Set(prev).add(code));
    try {
      await deleteInvite(code);
      setInvites((prev) => prev.filter((invite) => invite.code !== code));
    } catch (err) {
      setInvitesError(err instanceof Error ? err.message : "Failed to revoke invite");
    } finally {
      setDeletingCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  }

  async function handleCopyLink(code: string) {
    await navigator.clipboard.writeText(inviteLink(code));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 1500);
  }

  // nothing to roll back on failure since settings state is only ever
  // updated from a successful response
  async function handleToggleRefreshPaused() {
    if (!settings) return;

    setSettingsError(null);
    setTogglePending(true);
    try {
      const updated = await updateAppSettings({ refreshPaused: !settings.refreshPaused });
      setSettings(updated);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setTogglePending(false);
    }
  }

  // lazy-loads a day's quota groups on first expand, caches on success,
  // and clears any error on collapse so re-expanding retries a transient failure
  async function toggleDate(date: string) {
    if (expandedDates.has(date)) {
      setExpandedDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
      setDayErrors((prev) => {
        if (!(date in prev)) return prev;
        const next = { ...prev };
        delete next[date];
        return next;
      });
      return;
    }

    setExpandedDates((prev) => new Set(prev).add(date));

    if (groupsByDate[date] || loadingDates.has(date)) return;

    setLoadingDates((prev) => new Set(prev).add(date));
    try {
      const data = await getQuotaGroupsForDate(date);
      setGroupsByDate((prev) => ({ ...prev, [date]: data.groups }));
    } catch (err) {
      setDayErrors((prev) => ({
        ...prev,
        [date]: err instanceof Error ? err.message : "Failed to load quota groups",
      }));
    } finally {
      setLoadingDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
    }
  }

  // same lazy-load/cache/error shape as toggleDate, one level down
  // only called for "unknown (before tracking)" groups
  async function toggleGroup(date: string, group: QuotaActionGroup) {
    const key = groupKey(date, group);

    if (expandedGroups.has(key)) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setGroupErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setExpandedGroups((prev) => new Set(prev).add(key));

    if (callsByGroup[key] || loadingGroups.has(key)) return;

    setLoadingGroups((prev) => new Set(prev).add(key));
    try {
      const data = await getQuotaGroupCalls({
        date,
        callType: group.callType,
        action: null,
        userId: null,
        requestGroupId: null,
      });
      setCallsByGroup((prev) => ({ ...prev, [key]: data.calls }));
    } catch (err) {
      setGroupErrors((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Failed to load calls",
      }));
    } finally {
      setLoadingGroups((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const usedPct = today ? Math.min(100, Math.round((today.used / today.budget) * 100)) : 0;
  const callTypes = [...new Set(history.flatMap((d) => d.breakdown.map((b) => b.callType)))].sort();

  return (
    <main style={{ maxWidth: "950px", margin: "0 auto", display: "grid", gap: "1.5rem" }}>
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1rem",
            }}
          >
            <div>
              <div>Pause automatic refreshes</div>
              {settings && (
                <MutedText style={{ fontSize: "0.75rem" }}>
                  {settings.refreshPaused ? "⚠️ Paused" : "✅ Running"}
                  {settings.updatedBy ? " · last changed by an admin" : ""}
                </MutedText>
              )}
            </div>
            <button type="button" disabled={!settings || togglePending} onClick={() => void handleToggleRefreshPaused()}>
              {settings?.refreshPaused ? "Resume" : "Pause"}
            </button>
          </section>
          {settingsError && <ErrorText>{settingsError}</ErrorText>}

          <section
            style={{
              display: "grid",
              gap: "0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>Invites</h2>
              <MutedText style={{ fontSize: "0.75rem" }}>
                {usersCount !== null ? `${usersCount} of 100 OAuth slots used (estimate)` : ""}
              </MutedText>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                className="text-input"
                placeholder="Note (optional)"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" disabled={creatingInvite} onClick={() => void handleCreateInvite()}>
                Create invite
              </button>
            </div>

            {justCreated && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  background: "var(--accent-bg)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: "8px",
                  padding: "0.5rem 0.75rem",
                }}
              >
                <span style={{ overflowWrap: "anywhere" }}>
                  ✅ Created. Share this link: {inviteLink(justCreated.code)}
                </span>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button type="button" onClick={() => void handleCopyLink(justCreated.code)}>
                    {copiedCode === justCreated.code ? "Copied!" : "Copy"}
                  </button>
                  <button type="button" onClick={() => setJustCreated(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {invitesError && <ErrorText>{invitesError}</ErrorText>}

            {invites.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th className="admin-table-th">Note</th>
                      <th className="admin-table-th">Created</th>
                      <th className="admin-table-th">Status</th>
                      <th className="admin-table-th admin-table-th-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => {
                      const isUsed = invite.usedAt !== null;
                      const isDeleting = deletingCodes.has(invite.code);

                      return (
                        <tr key={invite.code}>
                          <td className="admin-table-td">{invite.note ?? <MutedText>—</MutedText>}</td>
                          <td className="admin-table-td">
                            {new Date(invite.createdAt).toLocaleDateString()}
                          </td>
                          <td className="admin-table-td">
                            {isUsed ? (
                              <MutedText>
                                Used by {invite.usedByEmail ?? "unknown"} on{" "}
                                {new Date(invite.usedAt!).toLocaleDateString()}
                              </MutedText>
                            ) : (
                              "Unused"
                            )}
                          </td>
                          <td className="admin-table-td admin-table-td-right">
                            {!isUsed && (
                              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                <button type="button" onClick={() => void handleCopyLink(invite.code)}>
                                  {copiedCode === invite.code ? "Copied!" : "Copy"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeleteInvite(invite.code)}
                                >
                                  Revoke
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

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
                      <th className="admin-table-th">Date</th>
                      {callTypes.map((ct) => (
                        <th key={ct} className="admin-table-th admin-table-th-right">
                          {ct}
                        </th>
                      ))}
                      <th className="admin-table-th admin-table-th-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((day) => {
                      const isExpanded = expandedDates.has(day.date);

                      return (
                        <Fragment key={day.date}>
                          <tr>
                            <td
                              className="admin-table-td"
                              onClick={() => void toggleDate(day.date)}
                              style={{
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
                              <td key={ct} className="admin-table-td admin-table-td-right">
                                {day.breakdown.find((b) => b.callType === ct)?.units ?? 0}
                              </td>
                            ))}
                            <td className="admin-table-td admin-table-td-right">{day.total}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td className="admin-table-td" colSpan={callTypes.length + 2}>
                                <QuotaDayDetail
                                  date={day.date}
                                  isLoading={loadingDates.has(day.date)}
                                  error={dayErrors[day.date]}
                                  groups={groupsByDate[day.date]}
                                  expandedGroups={expandedGroups}
                                  loadingGroups={loadingGroups}
                                  groupErrors={groupErrors}
                                  callsByGroup={callsByGroup}
                                  onToggleGroup={toggleGroup}
                                />
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

function QuotaDayDetail({
  date,
  isLoading,
  error,
  groups,
  expandedGroups,
  loadingGroups,
  groupErrors,
  callsByGroup,
  onToggleGroup,
}: {
  date: string;
  isLoading: boolean;
  error: string | undefined;
  groups: QuotaActionGroup[] | undefined;
  expandedGroups: Set<string>;
  loadingGroups: Set<string>;
  groupErrors: Record<string, string>;
  callsByGroup: Record<string, QuotaCall[]>;
  onToggleGroup: (date: string, group: QuotaActionGroup) => void;
}) {
  if (isLoading) return <Spinner label="Loading quota groups..." />;
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!groups) return null;
  if (groups.length === 0) return <MutedText>No calls recorded.</MutedText>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}>Time</th>
          <th style={{ textAlign: "center", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}>Action</th>
          <th style={{ textAlign: "center", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}>Call Type</th>
          <th style={{ textAlign: "center", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}>User</th>
          <th style={{ textAlign: "right", padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}>Units</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const key = groupKey(date, group);
          return (
            <QuotaGroupRow
              key={key}
              date={date}
              group={group}
              isExpanded={expandedGroups.has(key)}
              isLoading={loadingGroups.has(key)}
              error={groupErrors[key]}
              calls={callsByGroup[key]}
              onToggle={onToggleGroup}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function QuotaGroupRow({
  date,
  group,
  isExpanded,
  isLoading,
  error,
  calls,
  onToggle,
}: {
  date: string;
  group: QuotaActionGroup;
  isExpanded: boolean;
  isLoading: boolean;
  error: string | undefined;
  calls: QuotaCall[] | undefined;
  onToggle: (date: string, group: QuotaActionGroup) => void;
}) {
  const isDrillable = group.action === null;
  const cellStyle = { padding: "0.35rem 0.5rem", fontSize: "0.85rem" };

  return (
    <>
      <tr
        onClick={isDrillable ? () => onToggle(date, group) : undefined}
        style={{ cursor: isDrillable ? "pointer" : "default" }}
      >
        <td style={cellStyle} title={group.firstAt !== group.lastAt ? `Started ${formatPacificTime(group.firstAt)}` : undefined}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {isDrillable && (
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
            )}
            {formatPacificTime(group.lastAt)}
          </span>
        </td>
        <td style={cellStyle}>{group.action ?? "unknown (before tracking)"}</td>
        <td style={cellStyle}>{group.callType}</td>
        <td style={cellStyle}>{group.userEmail && <MutedText>{group.userEmail}</MutedText>}</td>
        <td style={{ ...cellStyle, textAlign: "right" }}>
          <MutedText>{group.units.toLocaleString()} units</MutedText>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} style={{ padding: "0.25rem 0.5rem 0.5rem 1.6rem" }}>
            <div style={{ display: "grid", gap: "0.25rem" }}>
              {isLoading && <Spinner label="Loading calls..." />}
              {error && <ErrorText>{error}</ErrorText>}
              {!isLoading && !error && calls && calls.length === 0 && (
                <MutedText>No calls recorded.</MutedText>
              )}
              {!isLoading &&
                !error &&
                calls &&
                calls.map((call, index) => (
                  <div
                    key={`${call.calledAt}-${call.callType}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>{formatPacificTime(call.calledAt)}</span>
                    <span>{call.callType}</span>
                    <MutedText>{call.units.toLocaleString()} units</MutedText>
                  </div>
                ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
