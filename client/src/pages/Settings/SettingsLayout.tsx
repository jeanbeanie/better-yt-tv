import {NavLink, Outlet} from "react-router-dom";

export default function SettingsLayout() {
  return(
    <main>
      <header>
        <h1>Settings</h1>
        <p>Manage your channels, lists, and live preferences.</p>
      </header>
      
      <nav style={{display:"flex", gap:"1rem", justifyContent:"center", margin:"1rem"}}>
        <NavLink to="/settings/channels">Channels</NavLink>
        <NavLink to="/settings/lists">Lists</NavLink>
      </nav>

      <Outlet/>
    </main>
  );
}
