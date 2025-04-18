/**
 * Centralised AbortController registry for per‑session cancellation.
 *
 * PR‑1 – plumbing only: the signal is created and propagated; actual
 * long‑running operations will start honouring it in PR‑2.
 */

const controllers: Map<string, AbortController> = new Map();

/**
 * Get (or lazily create) the AbortController for a session.
 */
export function getSessionAbortController(sessionId: string): AbortController {
  let controller = controllers.get(sessionId);
  if (!controller) {
    controller = new AbortController();
    controllers.set(sessionId, controller);
  }
  return controller;
}

/**
 * Convenience accessor for just the AbortSignal.
 */
export function getAbortSignal(sessionId: string): AbortSignal {
  return getSessionAbortController(sessionId).signal;
}

/**
 * Abort an ongoing session.  Downstream async code that was passed the signal
 * (and will start checking it in PR‑2) should throw an `AbortError`.
 */
export function abortSession(sessionId: string): void {
  const controller = controllers.get(sessionId);
  if (controller && !controller.signal.aborted) {
    controller.abort();
  }
  // Keep the entry so subsequent getSignal(id) still returns a signal that is
  // already aborted.  Call `resetAbort(sessionId)` to start a new round.
}

/**
 * Reset the abort status for a session (start a fresh controller).
 * Useful when a new user message arrives after an abort.
 */
export function resetAbort(sessionId: string): void {
  controllers.delete(sessionId);
}

/**
 * For test clean‑up only.
 */
export function _clearAllAbortControllers(): void {
  controllers.clear();
}
