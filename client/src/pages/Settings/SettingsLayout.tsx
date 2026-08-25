import {NavLink, Outlet} from "react-router-dom";
import { type User } from "../../lib/api";

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
        <NavLink to="/settings/channels">Channels</NavLink>
        <NavLink to="/settings/lists">Lists</NavLink>
        <NavLink to="/settings/advanced">Advanced</NavLink>
        {user?.is_admin && <NavLink to="/admin">Admin</NavLink>}
      </nav>

      <Outlet/>
    </main>
  );
}
