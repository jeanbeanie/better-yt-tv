import { useId, type InputHTMLAttributes } from "react";

type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "aria-label" | "aria-labelledby"
> & {
  label: string;
  // visually hidden, still read by screen readers
  hideLabel?: boolean;
  // forbidden, label must be the only source of the field's name for screen readers, these would override it
  "aria-label"?: never;
  "aria-labelledby"?: never;
};

// label and input are siblings with no wrapper so a page's style on the
// input lays out the same as a bare input
export default function TextField({
  label,
  hideLabel,
  type = "text",
  className,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const classes = ["text-input", className].filter(Boolean).join(" ");

  return (
    <>
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : undefined}>
        {label}
      </label>
      <input id={id} type={type} className={classes} {...rest} />
    </>
  );
}
