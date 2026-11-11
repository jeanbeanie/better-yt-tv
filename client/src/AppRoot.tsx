import App from "./App";
import DemoApp from "./DemoApp";
import { isDemoMode } from "./lib/demo/mode";

export default function AppRoot() {
  return isDemoMode() ? <DemoApp /> : <App />;
}
