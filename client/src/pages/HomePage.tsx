import { Link } from "react-router-dom";
import { getLoginUrl, hasInviteCode, type User } from "../lib/api";
import ErrorText from "../components/ErrorText";
import Spinner from "../components/Spinner";


type homePageProps = {
  user: User | null;
  error: string | null;
  loading: boolean;
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
            <a href={getLoginUrl()} className="button button-primary">
              Login
            </a>
          </div>
        )}

        {!loading && !user && !canLogin && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
              This app requires an invite right now!
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              Reach out if you&apos;d like access:{" "}
              <a href="https://github.com/jeanbeanie" target="_blank" rel="noreferrer">
                GitHub
              </a>
              {" · "}
              <a
                href="https://www.linkedin.com/in/jeane-ramos-83339399/"
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
