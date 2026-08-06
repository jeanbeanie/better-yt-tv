import { Link } from "react-router-dom";
import { type User } from "../App";
import { getLoginUrl } from "../lib/api";
import ErrorText from "../components/ErrorText";


type homePageProps = {
  user: User | null;
  error: string | null;
  loading: boolean;
}

export default function HomePage(props:homePageProps) {
  const {user, error, loading} = props;

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
          Every channel&apos;s latest video, queued round-robin — no algorithm, no
          more missing uploads you care about.
        </p>

        {loading && <p>Loading user...</p>}

        {error && <ErrorText>{error}</ErrorText>}

        {!loading && !user && (
          <div style={{ marginTop: "2rem" }}>
            <p style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Just hit play.</p>
            <a href={getLoginUrl()} className="button button-primary">
              Login
            </a>
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
