import { type ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "danger";
};

export default function Button({ variant = "default", className, ...rest }: ButtonProps) {
  const classes = ["button", variant === "danger" ? "button-danger" : "", className]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...rest} />;
}
