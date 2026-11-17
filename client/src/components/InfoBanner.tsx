import type { ReactNode } from "react";

type InfoBannerProps = {
  children: ReactNode;
};

export default function InfoBanner({ children }: InfoBannerProps) {
  return (
    <p
      style={{
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-border)",
        borderRadius: "12px",
        padding: "1rem",
      }}
    >
      {children}
    </p>
  );
}
