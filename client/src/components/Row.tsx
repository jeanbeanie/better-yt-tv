import { type CSSProperties, type ReactNode } from "react";

type RowProps = {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
};

export default function Row({ children, onClick, style }: RowProps) {
  return (
    <li
      className={onClick ? "divider-row divider-row-clickable" : "divider-row"}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined, ...style }}
    >
      {children}
    </li>
  );
}
