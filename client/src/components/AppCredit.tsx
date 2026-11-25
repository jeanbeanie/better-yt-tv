import MutedText from "./MutedText";
import { APP_VERSION } from "../lib/appVersion";

export default function AppCredit() {
  return (
    <MutedText style={{ fontSize: "0.875rem", marginTop: "1.5rem", paddingBottom: "2rem" }}>
      Made with ❤️ by Jeane Ramos · 2026 · {APP_VERSION}
    </MutedText>
  );
}
