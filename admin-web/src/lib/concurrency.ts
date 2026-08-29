/**
 * Runs `total` indexed tasks with at most `limit` in flight.
 *
 * <p>Uploads were run strictly one after another, so eight scans took eight round trips end to end
 * even though the office's connection was idle for most of each one. A handful at a time fills that
 * gap without turning a bulk upload into a self-inflicted flood: the limit is what keeps one user's
 * upload from starving everyone else's requests through the browser's connection pool.
 *
 * <p>Tasks are expected to record their own outcome — nothing is collected here and a rejection
 * would abandon the remaining work, so a caller must handle its own failures.
 */
export async function runWithLimit(
  total: number,
  limit: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  let next = 0;

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= total) return;
      await task(index);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, total)) }, worker));
}

/**
 * How many uploads may be in flight at once.
 *
 * <p>Three rather than "all of them": browsers cap concurrent connections to a host at six, and
 * leaving headroom means the progress polling and the rest of the app still get a connection while a
 * batch is uploading.
 */
export const UPLOAD_CONCURRENCY = 3;
