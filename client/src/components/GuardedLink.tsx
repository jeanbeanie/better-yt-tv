import { Link, type LinkProps } from "react-router-dom";
import { guardClick } from "../lib/navigationGuard";

export default function GuardedLink({ onClick, ...props }: LinkProps) {
  return <Link {...props} onClick={guardClick(onClick)} />;
}
