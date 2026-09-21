// Runs `fn` over `items` with at most `limit` calls in flight at once,
// preserving result order. Used for long-form chapter-by-chapter content
// generation, where each chapter is its own AI call and doing all of them
// at once would either hammer the customer's OpenAI rate limit or (for a
// 150-page book) fire 20+ simultaneous requests for no real speed benefit
// past a handful of concurrent calls.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
