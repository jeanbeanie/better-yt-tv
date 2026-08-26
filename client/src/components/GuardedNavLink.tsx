import { NavLink, type NavLinkProps } from "react-router-dom";
import { guardClick } from "../lib/navigationGuard";

export default function GuardedNavLink({ onClick, ...props }: NavLinkProps) {
  return <NavLink {...props} onClick={guardClick(onClick)} />;
}
