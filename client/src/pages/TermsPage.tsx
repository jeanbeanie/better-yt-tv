import MarkdownPage from "../components/MarkdownPage";

export default function TermsPage() {
  return (
    <MarkdownPage
      title="Terms of Service"
      src="/terms.md"
      loadingLabel="Loading terms..."
      align="left"
    />
  );
}
