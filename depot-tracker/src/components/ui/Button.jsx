const STYLES = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "bg-surface-2 text-ink hover:bg-surface-2/70 border border-surface-2",
  danger: "bg-loss text-white hover:opacity-90",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
};

export function Button({ variant = "primary", className = "", disabled, ...props }) {
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${STYLES[variant]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
