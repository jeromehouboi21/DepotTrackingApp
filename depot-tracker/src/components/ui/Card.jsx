export function Card({ title, action, children, className = "" }) {
  return (
    <div className={`bg-surface rounded-xl border border-surface-2 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          {title && <h3 className="text-sm font-medium text-ink-2 font-sans">{title}</h3>}
          {action}
        </div>
      )}
      <div className="px-4 pb-4 pt-1">{children}</div>
    </div>
  );
}
