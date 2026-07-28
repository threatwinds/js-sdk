/**
 * Warm-up handling for the self-hosted AI generation endpoints.
 *
 * Chat, embeddings, transcription and speech run on pods that scale to zero.
 * A request that arrives cold gets a 503 in one of two shapes:
 *
 *   - `model_warming_up` with a `Retry-After` header. The server is
 *     authoritative on timing: a cold boot can advertise ~1500s, a warm resume
 *     ~600s. Under-waiting just burns attempts on a pod that has not finished
 *     booting.
 *   - "no healthy backends" with **no** `Retry-After`. This is the first-touch
 *     response for a scaled-to-zero pod, before the scaler has registered it as
 *     warming. It is a warming signal in disguise, so it must be retried too —
 *     treating only `model_warming_up` as retryable fails immediately on the
 *     most common cold path.
 *
 * So any 503 is retryable here. Anything else — including a 500 — is a real
 * result the caller must see, not a warming state.
 */

/** Progress while a request waits for a cold model. */
export interface WarmupProgress {
  /** 1 for the first retry. */
  attempt: number;
  /** Seconds this client will wait before the next attempt. */
  waitSeconds: number;
  /** Seconds waited so far across all attempts. */
  elapsedSeconds: number;
  /** True when the server explicitly said it is warming, rather than 503-ing. */
  advertised: boolean;
}

export interface WarmupOptions {
  /**
   * Total wall-clock to spend retrying, in seconds.
   *
   * Defaults to 5 minutes rather than the ~30 the server's cold-start ceiling
   * would justify: a person is waiting on the other end of this, and a UI that
   * hangs silently for half an hour is indistinguishable from one that is
   * broken. Callers doing batch work should raise it.
   */
  budgetSeconds?: number;
  /** Called before each wait so a UI can show what is happening. */
  onWarming?(progress: WarmupProgress): void;
  signal?: AbortSignal;
}

export const DEFAULT_WARMUP_BUDGET_SECONDS = 300;

/**
 * Back-off applied to a 503 that carries no Retry-After. The server is silent
 * on timing, so this is a guess — deliberately short, because the alternative
 * (a long fixed wait) makes a transient blip feel like an outage.
 */
export const NO_BACKENDS_GRACE_SECONDS = 15;

/** One raw HTTP outcome. */
export interface HttpOutcome {
  status: number;
  headers: Headers;
  body: ArrayBuffer;
}

/**
 * Decides whether an outcome should be retried and how long to wait first.
 * Exported so the policy can be unit-tested without issuing requests.
 */
export function warmupDecision(
  status: number,
  headers: Headers | null,
): { retry: boolean; waitSeconds: number; advertised: boolean } {
  if (status !== 503) return { retry: false, waitSeconds: 0, advertised: false };

  const raw = headers?.get('Retry-After');
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return { retry: true, waitSeconds: parsed, advertised: true };
  }
  return { retry: true, waitSeconds: NO_BACKENDS_GRACE_SECONDS, advertised: false };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Re-issues `attempt` until it yields a non-503 outcome or the budget runs out.
 *
 * The final outcome is returned unchanged — including a 503 if the budget
 * expired — so the caller decides how to report it.
 */
export async function withWarmup(
  attempt: () => Promise<HttpOutcome>,
  options: WarmupOptions = {},
): Promise<HttpOutcome> {
  const budget = (options.budgetSeconds ?? DEFAULT_WARMUP_BUDGET_SECONDS) * 1000;
  const started = Date.now();
  let tries = 0;

  for (;;) {
    const outcome = await attempt();
    const decision = warmupDecision(outcome.status, outcome.headers);
    if (!decision.retry) return outcome;

    const elapsed = Date.now() - started;
    const wait = decision.waitSeconds * 1000;

    // Stop if the wait would take us past the budget; returning the 503 is
    // more useful than sleeping and returning the same 503 later.
    if (elapsed + wait > budget) return outcome;

    tries += 1;
    options.onWarming?.({
      attempt: tries,
      waitSeconds: decision.waitSeconds,
      elapsedSeconds: Math.round(elapsed / 1000),
      advertised: decision.advertised,
    });

    await sleep(wait, options.signal);
  }
}


/**
 * Retries a streaming call that failed its handshake with a 503.
 *
 * Only the handshake is retryable. `attempt` must not have emitted anything to
 * the caller before it throws, which holds for the chat stream: the SDK checks
 * the response status before yielding its first event, so a 503 always fails
 * ahead of any delta.
 */
export async function retryStreamWarmup<T>(
  attempt: () => Promise<T>,
  options: WarmupOptions = {},
): Promise<T> {
  const budget = (options.budgetSeconds ?? DEFAULT_WARMUP_BUDGET_SECONDS) * 1000;
  const started = Date.now();
  let tries = 0;

  for (;;) {
    try {
      return await attempt();
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status !== 503) throw err;

      const header = (err as { retryAfter?: string })?.retryAfter ?? '';
      const parsed = Number.parseInt(header, 10);
      const waitSeconds =
        Number.isFinite(parsed) && parsed > 0 ? parsed : NO_BACKENDS_GRACE_SECONDS;

      const elapsed = Date.now() - started;
      if (elapsed + waitSeconds * 1000 > budget) throw err;

      tries += 1;
      options.onWarming?.({
        attempt: tries,
        waitSeconds,
        elapsedSeconds: Math.round(elapsed / 1000),
        advertised: Number.isFinite(parsed) && parsed > 0,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitSeconds * 1000);
        options.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    }
  }
}
