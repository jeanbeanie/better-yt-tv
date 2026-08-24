import { useState } from "react";
import {NavLink, Outlet} from "react-router-dom";
import { deleteAccount, type User } from "../../lib/api";
import Button from "../../components/Button";
import ErrorText from "../../components/ErrorText";

type SettingsLayoutProps = {
  user: User | null;
};

export default function SettingsLayout({ user }: SettingsLayoutProps) {
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

  return(
    <main>
      <header>
        <h1>Settings</h1>
        <p>Manage your channels, lists, and live preferences.</p>
      </header>

      <nav style={{display:"flex", gap:"1rem", justifyContent:"center", margin:"1rem"}}>
        <NavLink to="/settings/channels">Channels</NavLink>
        <NavLink to="/settings/lists">Lists</NavLink>
        {user?.is_admin && <NavLink to="/admin">Admin</NavLink>}
      </nav>

      <Outlet/>

      <div style={{ marginTop: "3rem", textAlign: "center" }}>
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
    </main>
  );
}
