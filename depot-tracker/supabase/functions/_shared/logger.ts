// Strukturierter Logger fuer Edge Functions (Muster Friedensstifter).
export function log(fn: string, level: "info" | "warn" | "error", message: string, context?: unknown) {
  const line = JSON.stringify({
    fn,
    level,
    message,
    context: context ?? null,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function makeLogger(fn: string) {
  return {
    info: (m: string, c?: unknown) => log(fn, "info", m, c),
    warn: (m: string, c?: unknown) => log(fn, "warn", m, c),
    error: (m: string, c?: unknown) => log(fn, "error", m, c),
  };
}
