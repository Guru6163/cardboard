/**
 * Run work without blocking the input handler; cancel via returned function.
 */
export function scheduleIdleWork(fn, { timeout = 120 } = {}) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => fn(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
