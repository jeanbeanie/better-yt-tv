import { forwardRef, type ChangeEventHandler, type ReactNode } from "react";

type CheckboxLabelProps = {
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
};

const CheckboxLabel = forwardRef<HTMLInputElement, CheckboxLabelProps>(
  ({ checked, onChange, disabled, title, children }, ref) => {
    return (
      <label className="checkbox-label" title={title}>
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        {children}
      </label>
    );
  },
);

CheckboxLabel.displayName = "CheckboxLabel";

export default CheckboxLabel;
