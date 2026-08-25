import { type ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "danger" | "primary";
};

export default function Button({ variant = "default", className, ...rest }: ButtonProps) {
  const variantClass =
    variant === "danger" ? "button-danger" : variant === "primary" ? "button-primary" : "";
  const classes = ["button", variantClass, className].filter(Boolean).join(" ");

  return <button className={classes} {...rest} />;
}
