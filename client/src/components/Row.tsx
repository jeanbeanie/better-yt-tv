import { type CSSProperties, type ReactNode } from "react";

type RowProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

export default function Row({ children, onClick, className, style }: RowProps) {
  const classes = ["divider-row", onClick ? "divider-row-clickable" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={classes}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : undefined, ...style }}
    >
      {children}
    </li>
  );
}
