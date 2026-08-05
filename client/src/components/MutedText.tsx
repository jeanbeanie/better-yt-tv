import { type CSSProperties, type ReactNode } from "react";

type MutedTextProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export default function MutedText({ children, style }: MutedTextProps) {
  return (
    <p className="text-muted" style={style}>
      {children}
    </p>
  );
}
