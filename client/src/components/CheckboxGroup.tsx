import { type CSSProperties, type ReactNode } from "react";

type CheckboxGroupProps = {
  // names the group for screen readers, visually hidden
  legend: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

// fieldset with its legend first, the visible text for a group lives in the page
export default function CheckboxGroup({ legend, children, className, style }: CheckboxGroupProps) {
  const classes = ["plain-fieldset", className].filter(Boolean).join(" ");

  return (
    <fieldset className={classes} style={style}>
      <legend className="visually-hidden">{legend}</legend>
      {children}
    </fieldset>
  );
}
