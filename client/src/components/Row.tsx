import { type CSSProperties, type ReactNode } from "react";

type RowProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

// no onClick on purpose, an li is not keyboard operable
// put a RowSelectButton inside to make a row selectable
export default function Row({ children, className, style }: RowProps) {
  const classes = ["divider-row", className].filter(Boolean).join(" ");

  return (
    <li className={classes} style={style}>
      {children}
    </li>
  );
}
