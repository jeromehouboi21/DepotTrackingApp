// Frontend-Logger: console + optional app_logs (best effort, blockiert nie).
import { supabase } from "./supabase";

type Level = "info" | "warn" | "error";

async function write(level: Level, message: string, context?: unknown) {
  const line = `[depot-tracker] ${message}`;
  if (level === "error") console.error(line, context ?? "");
  else if (level === "warn") console.warn(line, context ?? "");
  else console.log(line, context ?? "");

  try {
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return;
    await supabase.from("app_logs").insert({
      user_id: data.user.id,
      level,
      message,
      context: context ? JSON.parse(JSON.stringify(context)) : null,
    });
  } catch {
    /* Logging darf nie die App stoeren */
  }
}

export const logger = {
  info: (m: string, c?: unknown) => write("info", m, c),
  warn: (m: string, c?: unknown) => write("warn", m, c),
  error: (m: string, c?: unknown) => write("error", m, c),
};
