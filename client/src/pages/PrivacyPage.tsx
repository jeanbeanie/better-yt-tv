import MarkdownPage from "../components/MarkdownPage";

export default function PrivacyPage() {
  return (
    <MarkdownPage
      title="Privacy Policy"
      src="/privacy.md"
      loadingLabel="Loading privacy policy..."
      align="left"
    />
  );
}
