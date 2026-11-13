import { Link } from "react-router-dom";
import { getLoginUrl, hasInviteCode, type User } from "../lib/api";
import ErrorText from "../components/ErrorText";
import Spinner from "../components/Spinner";
import { GITHUB_URL, LINKEDIN_URL } from "../lib/contactLinks";


type homePageProps = {
  user: User | null;
  error: string | null;
  loading: boolean;
}

const buttonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.75rem",
} as const;

function TryDemoButton() {
  // plain anchor, full page load remounts the app under the /demo basename
  return (
    <a
      href="/demo"
      className="button button-primary"
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M7 4.5v15l12-7.5z" />
      </svg>
      Try the demo
    </a>
  );
}

export default function HomePage(props:homePageProps) {
  const {user, error, loading} = props;
  const canLogin = hasInviteCode();

  return (
    <main>
      <h1>YT Catchup</h1>
      <div style={{ margin: "3rem 0 4rem" }}>
        <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-h)" }}>
          The subscriptions feed, fixed.
        </p>
        <p style={{ fontSize: "1.25rem", fontWeight: 500, color: "var(--accent)" }}>
          Stop scrolling. Start watching.
        </p>
        <p style={{ maxWidth: "34rem", margin: "1rem auto 0" }}>
          Every channel&apos;s latest video, queued round-robin. No algorithm, no
          more missing uploads you care about.
        </p>

        {loading && <Spinner label="Loading user..." />}

        {error && <ErrorText>{error}</ErrorText>}

        {!loading && !user && canLogin && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Just hit play.</p>
            <div style={buttonRowStyle}>
              <TryDemoButton />
              <a href={getLoginUrl()} className="button button-secondary">
                Login
              </a>
            </div>
          </div>
        )}

        {!loading && !user && !canLogin && (
          <div style={{ ...buttonRowStyle, marginTop: "2rem" }}>
            <TryDemoButton />
          </div>
        )}

        {!loading && !user && !canLogin && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
              This app requires an invite right now!
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              Reach out if you&apos;d like access:{" "}
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              {" · "}
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn
              </a>
            </p>
          </div>
        )}

        {!loading && user && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
              Logged in as <strong>{user.email ?? "No email found"}</strong>
            </p>

            <Link to="/all" className="button button-primary">
              Go to /all videos
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
