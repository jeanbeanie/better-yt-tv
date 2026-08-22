import { useEffect, useState } from "react";

const MESSAGE_TIMEOUT_MS = 5000;

export default function RefreshPausedNotice() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed) return null;

  return (
    <p
      className="text-muted"
      style={{
        border: "1px solid var(--accent)",
        borderRadius: "8px",
        padding: "0.5rem 0.75rem",
      }}
    >
      ⚠️ Automatic refreshes have been temporarily paused. Showing cached videos.
    </p>
  );
}
