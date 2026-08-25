import { useState } from "react";
import { deleteAccount } from "../../lib/api";
import Button from "../../components/Button";
import ErrorText from "../../components/ErrorText";

export default function AdvancedSettingsPage() {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your account and all its data? This can't be undone.")) return;

    try {
      setDeleting(true);
      setDeleteError(null);

      await deleteAccount();

      window.location.assign("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div style={{ marginTop: "1rem", textAlign: "center" }}>
      <Button
        variant="danger"
        onClick={() => void handleDeleteAccount()}
        disabled={deleting}
        style={{ fontSize: "0.8rem", opacity: 0.7 }}
      >
        {deleting ? "Deleting..." : "Delete my account and data"}
      </Button>
      {deleteError && <ErrorText style={{ marginTop: "0.5rem" }}>{deleteError}</ErrorText>}
    </div>
  );
}
