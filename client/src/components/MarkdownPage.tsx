import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import ErrorText from "./ErrorText";
import MutedText from "./MutedText";
import Spinner from "./Spinner";

type MarkdownPageProps = {
  title: string;
  subtitle?: string;
  src: string;
  loadingLabel: string;
  align?: "left" | "center";
};

export default function MarkdownPage({
  title,
  subtitle,
  src,
  loadingLabel,
  align = "center",
}: MarkdownPageProps) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(src);

        if (!response.ok) {
          throw new Error(`Failed to load ${title.toLowerCase()}: ${response.status}`);
        }

        const text = await response.text();
        setMarkdown(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to load ${title.toLowerCase()}`);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [src, title]);

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
        <h1 style={{ marginBottom: "0.5rem" }}>{title}</h1>
      </header>
      {subtitle && <MutedText>{subtitle}</MutedText>}

      {loading && <Spinner label={loadingLabel} />}

      {error && <ErrorText>{error}</ErrorText>}

      {!loading && !error && (
        <article
          className="markdown-article"
          style={{
            lineHeight: 1.6,
            textAlign: align,
          }}
        >
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </article>
      )}
    </main>
  );
}
