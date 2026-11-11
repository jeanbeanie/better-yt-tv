import { Link } from "react-router-dom";

export default function DemoHomePage() {
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

        <div style={{ marginTop: "2rem" }}>
          <Link to="/all" className="button button-primary">
            Go to /all videos
          </Link>
        </div>
      </div>
    </main>
  );
}
