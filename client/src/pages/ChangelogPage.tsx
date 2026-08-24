import MarkdownPage from "../components/MarkdownPage";

export default function ChangelogPage() {
  return (
    <MarkdownPage
      title="YT Catchup Changelog"
      subtitle="What shipped, grouped by date."
      src="/changelog.md"
      loadingLabel="Loading changelog..."
    />
  );
}
