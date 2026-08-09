export function EmptyState({ title, children, action }) {
  return (
    <div className="bg-surface rounded-xl border border-surface-2 px-6 py-12 text-center">
      <div className="text-lg text-ink-2 mb-1">{title}</div>
      {children && <div className="text-sm text-ink-3 mb-4">{children}</div>}
      {action}
    </div>
  );
}
