export function Tabs({ options, value, onChange, className = "" }) {
  return (
    <div className={`inline-flex rounded-lg bg-surface-2 p-0.5 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            value === opt.value ? "bg-surface shadow-sm text-ink font-medium" : "text-ink-2 hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
