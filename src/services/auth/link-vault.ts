import type { Document } from "../../core/model";
import { emptyDocument } from "../../core/model";
import { decryptDocument, type VaultKeys } from "../../core/crypto";
import { repository } from "../storage/repository";
import { runExclusive } from "../storage/lock";
import { createOperations } from "../sync";
import { currentSession, remoteVault, rememberSession } from "./client";

/** Explicit linking preserves the cryptographic owner, vault ID and all entity identifiers. */
export async function linkVault(keys: VaultKeys, _doc: Document) {
  const session = currentSession();
  if (!session) throw Error("Entre na conta antes de conectar o cofre.");
  const remote = await remoteVault();
  if (remote && remote.header.vaultId !== keys.header.vaultId)
    throw Error(
      "Esta conta já tem outro cofre. Abra o cofre da conta; não substituiremos nenhum histórico.",
    );
  await runExclusive(async () => {
    const record = await repository.get(keys.header.owner);
    if (!record) throw Error("O cofre local não foi encontrado.");
    if (record.accountId && record.accountId !== session.user.id)
      throw Error("Este cofre já está associado a outra conta.");
    const operations =
      !record.accountId && !(await repository.outbox(record.owner)).length
        ? await createOperations(
            emptyDocument(),
            await decryptDocument(record.envelope, keys),
            keys,
            record.owner,
          )
        : [];
    await repository.commit(
      {
        ...record,
        accountId: session.user.id,
        authorized: true,
        pending: record.pending || !record.accountId,
      },
      operations,
    );
  });
  await rememberSession(keys);
}
