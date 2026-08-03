import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";

export default function DevlogPage() {
  // raw markdown text fetched from /devlog.md
  const [markdown, setMarkdown] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDevlog() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/devlog.md");

        if (!response.ok) {
          throw new Error(`Failed to load devlog: ${response.status}`);
        }

        const text = await response.text();
        setMarkdown(text);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load devlog",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadDevlog();
  }, []);

  return (
    <main
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        display: "grid",
        gap: "1rem",
      }}
    >
      <header>
        <h1 style={{ marginBottom: "0.5rem" }}>Better YT TV Devlog</h1>
      </header>
        <p style={{ margin: 0, color: "#666" }}>
          Notes, decisions, and progress updates while building Better YT TV.
        </p>

      {loading && <p>Loading devlog...</p>}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loading && !error && (
        <article
          className="devlog-article"
          style={{
            lineHeight: 1.6,
          }}
        >
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      )}
    </main>
  );
}
