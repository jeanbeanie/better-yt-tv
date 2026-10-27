import { type ReactNode } from "react";

type RowSelectButtonProps = {
  children: ReactNode;
  onClick: () => void;
  "aria-current"?: boolean | "true";
};

// the real button for a selectable Row, its ::after stretches over the whole
// row so a mouse click anywhere selects while keyboard users get a normal button
// index.css styles the parent row via :has(.row-select)
export default function RowSelectButton({ children, onClick, ...rest }: RowSelectButtonProps) {
  return (
    <button type="button" className="row-select" onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
