import { GITHUB_URL, LINKEDIN_URL } from "../lib/contactLinks";

export default function DemoBanner() {
  return (
    <p
      className="text-muted"
      style={{
        border: "1px solid var(--accent)",
        borderRadius: "8px",
        padding: "0.5rem 0.75rem",
        marginBottom: "1rem",
      }}
    >
      You&apos;re viewing a demo with sample data. Want an invite?{" "}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer">
        GitHub
      </a>
      {" · "}
      <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">
        LinkedIn
      </a>
    </p>
  );
}
