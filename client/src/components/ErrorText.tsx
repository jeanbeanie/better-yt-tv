import { type CSSProperties, type ReactNode } from "react";

type ErrorTextProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export default function ErrorText({ children, style }: ErrorTextProps) {
  return (
    <p className="error-text" style={style}>
      {children}
    </p>
  );
}
