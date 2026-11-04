import { type CSSProperties, type ReactNode } from "react";

type ErrorTextProps = {
  children: ReactNode;
  style?: CSSProperties;
  // false for a copy of an error already announced elsewhere on the page
  announce?: boolean;
};

export default function ErrorText({ children, style, announce = true }: ErrorTextProps) {
  return (
    <p className="error-text" style={style} role={announce ? "alert" : undefined}>
      {children}
    </p>
  );
}
