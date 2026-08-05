import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import ErrorText from "../components/ErrorText";
import MutedText from "../components/MutedText";

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
        <h1 style={{ marginBottom: "0.5rem" }}>YT Catchup Devlog</h1>
      </header>
        <MutedText>
          Notes, decisions, and progress updates while building YT Catchup.
        </MutedText>

      {loading && <p>Loading devlog...</p>}

      {error && <ErrorText>{error}</ErrorText>}

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
