import { Outlet } from "react-router-dom";
import { type User } from "../../lib/api";
import GuardedNavLink from "../../components/GuardedNavLink";

type SettingsLayoutProps = {
  user: User | null;
};

export default function SettingsLayout({ user }: SettingsLayoutProps) {
  return(
    <main>
      <header>
        <h1>Settings</h1>
        <p>Manage your channels, lists, and live preferences.</p>
      </header>

      <nav style={{display:"flex", gap:"1rem", justifyContent:"center", margin:"1rem"}}>
        <GuardedNavLink to="/settings/channels">Channels</GuardedNavLink>
        <GuardedNavLink to="/settings/lists">Lists</GuardedNavLink>
        <GuardedNavLink to="/settings/advanced">Advanced</GuardedNavLink>
        {user?.is_admin && <GuardedNavLink to="/admin">Admin</GuardedNavLink>}
      </nav>

      <Outlet/>
    </main>
  );
}
