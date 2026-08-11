type SpinnerProps = {
  label?: string;
};

export default function Spinner({ label }: SpinnerProps) {
  return (
    <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  );
}
