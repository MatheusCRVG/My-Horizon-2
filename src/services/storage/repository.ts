import Dexie, { type Table } from "dexie";
import { envelopeSchema, type Envelope } from "../../core/crypto";
import { isNative } from "../platform";
export type SealedSession = { iv: string; cipher: string };
export type VaultRecord = {
  owner: string;
  envelope: Envelope;
  pending: boolean;
  lastSync?: string;
  device: string;
  seen: string[];
  accountId?: string;
  cursor?: number;
  session?: SealedSession;
  authorized?: boolean;
};
export type OperationRecord = {
  id: string;
  owner: string;
  vaultId: string;
  payload: Envelope;
  createdAt: string;
  acknowledged?: boolean;
};
export interface VaultRepository {
  get(owner: string): Promise<VaultRecord | undefined>;
  list(): Promise<VaultRecord[]>;
  put(record: VaultRecord): Promise<void>;
  commit(
    record: VaultRecord,
    operations?: OperationRecord[],
    acknowledged?: string[],
  ): Promise<void>;
  outbox(owner: string): Promise<OperationRecord[]>;
}
class WebDatabase extends Dexie {
  vaults!: Table<VaultRecord, string>;
  operations!: Table<OperationRecord, string>;
  constructor() {
    super("financeiro5-encrypted");
    this.version(1).stores({ vaults: "owner" });
    this.version(2).stores({ vaults: "owner", operations: "id,owner" });
  }
}
const web = new WebDatabase();
export function validateRecord(record: VaultRecord, previous?: VaultRecord) {
  const envelope = envelopeSchema.parse(record.envelope);
  if (!record.owner || envelope.owner !== record.owner || !record.device)
    throw Error("Identificação do cofre inválida. Nenhum dado foi alterado.");
  if (!Number.isSafeInteger(record.cursor ?? 0) || (record.cursor ?? 0) < 0)
    throw Error("Posição de sincronização inválida.");
  if (
    previous &&
    (previous.envelope.vaultId !== envelope.vaultId ||
      (previous.accountId && previous.accountId !== record.accountId) ||
      (record.cursor ?? 0) < (previous.cursor ?? 0))
  )
    throw Error(
      "O cofre, a conta ou a posição de sincronização não podem ser substituídos.",
    );
}
function validateOperation(operation: OperationRecord, record: VaultRecord) {
  envelopeSchema.parse(operation.payload);
  if (
    operation.owner !== record.owner ||
    operation.payload.owner !== record.owner ||
    operation.vaultId !== record.envelope.vaultId ||
    operation.payload.vaultId !== operation.vaultId
  )
    throw Error("Operação pertence a outro cofre.");
}
const browserRepository: VaultRepository = {
  get: (owner) => web.vaults.get(owner),
  list: () => web.vaults.toArray(),
  put: async (record) => browserRepository.commit(record),
  outbox: (owner) =>
    web.operations
      .where("owner")
      .equals(owner)
      .filter((r) => !r.acknowledged)
      .toArray(),
  commit: async (record, operations = [], acknowledged = []) => {
    await web.transaction("rw", web.vaults, web.operations, async () => {
      validateRecord(record, await web.vaults.get(record.owner));
      for (const operation of operations) {
        validateOperation(operation, record);
        const previous = await web.operations.get(operation.id);
        if (previous) {
          const { acknowledged: _a, ...prior } = previous;
          const { acknowledged: _b, ...incoming } = operation;
          if (JSON.stringify(prior) !== JSON.stringify(incoming))
            throw Error(
              "Identificador de operação reutilizado com outro conteúdo.",
            );
        } else await web.operations.put(operation);
      }
      for (const id of acknowledged) {
        const operation = await web.operations.get(id);
        if (operation && operation.owner !== record.owner)
          throw Error("Não é possível confirmar uma operação de outra conta.");
        if (operation)
          await web.operations.put({ ...operation, acknowledged: true });
      }
      await web.vaults.put(record);
    });
  },
};
async function invoke<T>(command: string, args?: Record<string, unknown>) {
  return (await import("@tauri-apps/api/core")).invoke<T>(command, args);
}
const nativeRepository: VaultRepository = {
  get: async (owner) =>
    (await invoke<VaultRecord | null>("vault_get", { owner })) ?? undefined,
  list: () => invoke("vault_list"),
  put: (record) => invoke("vault_put", { record }),
  commit: (record, operations = [], acknowledged = []) =>
    invoke("vault_commit", { record, operations, acknowledged }),
  outbox: (owner) => invoke("outbox_list", { owner }),
};
// A native database failure must never silently redirect financial writes to another store.
export const repository: VaultRepository = {
  get: (owner) =>
    (isNative() ? nativeRepository : browserRepository).get(owner),
  list: () => (isNative() ? nativeRepository : browserRepository).list(),
  put: (record) =>
    (isNative() ? nativeRepository : browserRepository).put(record),
  commit: (record, operations, acknowledged) =>
    (isNative() ? nativeRepository : browserRepository).commit(
      record,
      operations,
      acknowledged,
    ),
  outbox: (owner) =>
    (isNative() ? nativeRepository : browserRepository).outbox(owner),
};
