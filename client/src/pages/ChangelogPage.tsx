import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import ErrorText from "../components/ErrorText";
import MutedText from "../components/MutedText";
import Spinner from "../components/Spinner";

export default function ChangelogPage() {
  // raw markdown text fetched from /changelog.md
  const [markdown, setMarkdown] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadChangelog() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/changelog.md");

        if (!response.ok) {
          throw new Error(`Failed to load changelog: ${response.status}`);
        }

        const text = await response.text();
        setMarkdown(text);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load changelog",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadChangelog();
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
        <h1 style={{ marginBottom: "0.5rem" }}>YT Catchup Changelog</h1>
      </header>
        <MutedText>
          What shipped, grouped by date.
        </MutedText>

      {loading && <Spinner label="Loading changelog..." />}

      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && (
        <article
          className="markdown-article"
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
