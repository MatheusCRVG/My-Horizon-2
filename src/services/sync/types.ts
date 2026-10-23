import type { Envelope, VaultKeys } from "../../core/crypto";
import type { Document } from "../../core/model";

export type VaultHeader = VaultKeys["header"];
export type OperationRecord = {
  id: string;
  owner: string;
  vaultId: string;
  payload: Envelope;
  createdAt: string;
};
/** Structural minimum: generic records retain sealed session and future repository fields. */
export type SyncVaultRecord = {
  owner: string;
  envelope: Envelope;
  pending: boolean;
  lastSync?: string;
  device: string;
  seen: string[];
  accountId?: string;
  cursor?: number;
  authorized?: boolean;
};
export interface SyncRepository<R extends SyncVaultRecord = SyncVaultRecord> {
  get(owner: string): Promise<R | undefined>;
  outbox(owner: string): Promise<OperationRecord[]>;
  /** Atomically store the encrypted document/cursor and enqueue/delete operations. */
  commit(
    record: R,
    operations?: OperationRecord[],
    acknowledged?: string[],
  ): Promise<void>;
}
export type ExchangeRequest = {
  vaultId: string;
  header: VaultHeader;
  operations: { op_id: string; payload: Envelope }[];
  cursor: number;
  limit: number;
};
export type ExchangePage = {
  header: VaultHeader;
  operations: { op_id: string; seq: number; payload: Envelope }[];
  cursor: number;
  has_more: boolean;
};
export interface SyncTransport {
  /** Authenticated Supabase UUID, never the legacy cryptographic owner. */
  accountId: string;
  exchange(request: ExchangeRequest): Promise<ExchangePage>;
  bootstrap?(): Promise<VaultHeader | null>;
}
export type SyncOptions<R extends SyncVaultRecord> = {
  record: R;
  keys: VaultKeys;
  doc: Document;
  repository: SyncRepository<R>;
  transport: SyncTransport;
  active: () => boolean;
  limit?: number;
};
