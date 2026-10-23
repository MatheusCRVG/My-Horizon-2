import { SyncCancelledError, SyncProtocolError } from "./protocol";

export type BackoffOptions = {
  attempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  retryable?: (error: unknown) => boolean;
  active?: () => boolean;
};
/** Retry the same persisted operation, never create a new UUID inside `run`. */
export async function retryWithBackoff<T>(
  run: () => Promise<T>,
  {
    attempts = 3,
    baseDelay = 250,
    maxDelay = 5000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    retryable = (error) =>
      !(
        error instanceof SyncProtocolError ||
        error instanceof SyncCancelledError
      ),
    active = () => true,
  }: BackoffOptions = {},
): Promise<T> {
  if (
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > 10 ||
    !Number.isFinite(baseDelay) ||
    baseDelay < 0 ||
    !Number.isFinite(maxDelay) ||
    maxDelay < baseDelay
  )
    throw new SyncProtocolError("A política de novas tentativas é inválida.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!active()) throw new SyncCancelledError();
    try {
      return await run();
    } catch (error) {
      if (attempt === attempts - 1 || !retryable(error)) throw error;
      if (!active()) throw new SyncCancelledError();
      const jitter = Math.max(0, Math.min(1, random()));
      await sleep(
        Math.min(maxDelay, baseDelay * 2 ** attempt) * (0.75 + jitter * 0.25),
      );
    }
  }
  throw new SyncProtocolError("Não foi possível concluir a sincronização.");
}
