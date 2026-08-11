// Next.js's documented server-startup hook (runs once, before any request
// is handled) -- used here purely to start the scheduled-send/snooze
// background pollers exactly once. See lib/api/scheduler.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/api/scheduler");
  startScheduler();
}
