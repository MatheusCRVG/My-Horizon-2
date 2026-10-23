import type { ExchangeRequest, SyncTransport } from "./types";
import {
  checkedPage,
  headerSchema,
  SyncProtocolError,
  uuidSchema,
} from "./protocol";
import { retryWithBackoff, type BackoffOptions } from "./retry";

export type HorizonRpc = (
  name: "horizon_exchange" | "horizon_bootstrap",
  parameters?: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
  status?: number;
}>;
class TransientRpcError extends Error {}
const networkFailure = (error: unknown) =>
  (error instanceof Error &&
    /fetch|network|load failed|timeout|timed out/i.test(error.message)) ||
  (error instanceof DOMException &&
    ["AbortError", "TimeoutError", "NetworkError"].includes(error.name));
export function createRpcTransport({
  accountId,
  rpc,
  active = () => true,
  backoff = {},
}: {
  accountId: string;
  rpc: HorizonRpc;
  active?: () => boolean;
  backoff?: Pick<BackoffOptions, "sleep" | "random">;
}): SyncTransport {
  uuidSchema.parse(accountId);
  const call = (
    name: Parameters<HorizonRpc>[0],
    parameters?: Record<string, unknown>,
  ) =>
    retryWithBackoff(
      async () => {
        let response: Awaited<ReturnType<HorizonRpc>>;
        try {
          response = await rpc(name, parameters);
        } catch (error) {
          if (networkFailure(error))
            throw new TransientRpcError((error as Error).message);
          throw error;
        }
        const status = response.status;
        if (
          status === 0 ||
          (status !== undefined && status >= 500 && status < 600)
        )
          throw new TransientRpcError(
            response.error?.message ||
              "Falha temporária ao conectar à sincronização.",
          );
        if (response.error) {
          if (
            status === undefined &&
            !response.error.code &&
            networkFailure(new Error(response.error.message))
          )
            throw new TransientRpcError(response.error.message);
          throw new SyncProtocolError(response.error.message);
        }
        return response;
      },
      {
        attempts: 3,
        baseDelay: 250,
        maxDelay: 1000,
        ...backoff,
        active,
        retryable: (error) => error instanceof TransientRpcError,
      },
    );
  return {
    accountId,
    async bootstrap() {
      const response = await call("horizon_bootstrap");
      const wrapped =
        response.data !== null &&
        typeof response.data === "object" &&
        !Array.isArray(response.data) &&
        "header" in response.data
          ? (response.data as Record<string, unknown>)
          : undefined;
      const raw = wrapped ? wrapped.header : response.data;
      if (raw === null) {
        if (wrapped?.vault_id != null)
          throw new SyncProtocolError(
            "A inicialização retornou um cofre sem seu cabeçalho de proteção.",
          );
        return null;
      }
      const header = headerSchema.parse(raw);
      if (
        wrapped?.vault_id !== undefined &&
        wrapped.vault_id !== header.vaultId
      )
        throw new SyncProtocolError(
          "O cabeçalho de inicialização pertence a outro cofre.",
        );
      // Bootstrap is only a header lookup. Any preview page is re-read safely from cursor zero.
      return header;
    },
    async exchange(request: ExchangeRequest) {
      const response = await call("horizon_exchange", {
        p_vault_id: request.vaultId,
        p_header: request.header,
        p_operations: request.operations,
        p_cursor: request.cursor,
        p_limit: request.limit,
      });
      // Structural/page assertions run again in the engine with the actual unlocked keys.
      return checkedPage(response.data, request.cursor, request.limit, {
        header: request.header,
      });
    },
  };
}
