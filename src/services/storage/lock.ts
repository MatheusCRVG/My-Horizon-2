let chain: Promise<unknown> = Promise.resolve();
/** One lock for financial writes, sync and session metadata, including multiple browser tabs. */
export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(() =>
    navigator.locks ? navigator.locks.request("financeiro5-write", fn) : fn(),
  );
  chain = next.catch(() => {});
  return next;
}
