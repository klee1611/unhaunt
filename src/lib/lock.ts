// One approval-and-send at a time per item. The checks (status, fresh sign-in, sent-list) and the
// send span several awaits over JSON files, so two simultaneous requests could both pass them.
// A second request for an item already in flight is refused, not queued.
const inFlight = new Set<string>();

export async function withItemLock<T>(id: string, fn: () => Promise<T>): Promise<{ locked: true } | { locked: false; value: T }> {
  if (inFlight.has(id)) return { locked: true };
  inFlight.add(id);
  try {
    return { locked: false, value: await fn() };
  } finally {
    inFlight.delete(id);
  }
}
