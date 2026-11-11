import { Outlet } from "react-router-dom";
import GuardedNavLink from "../../components/GuardedNavLink";

export default function DemoSettingsLayout() {
  return(
    <main>
      <header>
        <h1>Settings</h1>
        <p>Manage your channels, lists, and live preferences.</p>
      </header>

      <nav style={{display:"flex", gap:"1rem", justifyContent:"center", margin:"1rem"}}>
        <GuardedNavLink to="/settings/channels">Channels</GuardedNavLink>
        <GuardedNavLink to="/settings/lists">Lists</GuardedNavLink>
      </nav>

      <Outlet/>
    </main>
  );
}
