/**
 * Runs `fn` over every item in `items` with at most `limit` concurrent
 * executions at any time. Unlike naive Promise.all (which fires all N
 * simultaneously) or chunking (which waits for an entire batch before
 * starting the next), this pool opens a new slot the moment any prior
 * task finishes — no straggler blocking.
 *
 * Results are collected in `sink` if provided; otherwise the caller
 * can use closures to accumulate results inside `fn`.
 */
export async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p: Promise<void> = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}
