import { z } from "zod";
import { documentSchema, type Document } from "./model";
const rounds = 600000;
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (a: ArrayBuffer | Uint8Array) => {
  const bytes = a instanceof Uint8Array ? a : new Uint8Array(a);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const salt = () => crypto.getRandomValues(new Uint8Array(16));
const iv = () => crypto.getRandomValues(new Uint8Array(12));
const wrapSchema = z.object({
  salt: z.string(),
  iv: z.string(),
  cipher: z.string(),
  rounds: z.literal(rounds),
});
export const envelopeSchema = z.object({
  format: z.literal("financeiro5"),
  version: z.literal(1),
  vaultId: z.string(),
  owner: z.string(),
  password: wrapSchema,
  recovery: wrapSchema,
  iv: z.string(),
  cipher: z.string(),
});
export type Envelope = z.infer<typeof envelopeSchema>;
type Wrap = z.infer<typeof wrapSchema>;
export type VaultKeys = {
  key: CryptoKey;
  header: Omit<Envelope, "iv" | "cipher">;
};
async function derive(secret: string, s: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: s, iterations: rounds, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function wrap(
  raw: Uint8Array,
  secret: string,
  aad: string,
): Promise<Wrap> {
  const s = salt(),
    v = iv(),
    k = await derive(secret, s);
  return {
    salt: b64(s),
    iv: b64(v),
    rounds,
    cipher: b64(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: v, additionalData: te.encode(aad) },
        k,
        raw,
      ),
    ),
  };
}
export async function createKeys(password: string, owner: string) {
  if (password.length < 12)
    throw Error("Use uma senha-mestra com pelo menos 12 caracteres.");
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const vaultId = crypto.randomUUID();
  const recovery = b64(crypto.getRandomValues(new Uint8Array(32)));
  const aad = `financeiro5:1:${owner}:${vaultId}`;
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  const header = {
    format: "financeiro5" as const,
    version: 1 as const,
    vaultId,
    owner,
    password: await wrap(raw, password, aad),
    recovery: await wrap(raw, recovery, aad),
  };
  raw.fill(0);
  return { keys: { key, header }, recovery };
}
const aadFor = (e: Pick<Envelope, "owner" | "vaultId">) =>
  te.encode(`financeiro5:1:${e.owner}:${e.vaultId}`);
export async function unlock(
  envelope: Envelope,
  secret: string,
  useRecovery = false,
): Promise<VaultKeys> {
  const e = envelopeSchema.parse(envelope),
    w = useRecovery ? e.recovery : e.password;
  try {
    const k = await derive(secret, un64(w.salt));
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: un64(w.iv), additionalData: aadFor(e) },
      k,
      un64(w.cipher),
    );
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    new Uint8Array(raw).fill(0);
    const { iv: _i, cipher: _c, ...header } = e;
    return { key, header };
  } catch {
    throw Error(
      "Senha ou chave incorreta, ou cofre danificado. Nenhum dado foi alterado.",
    );
  }
}
export async function encryptDocument(
  doc: Document,
  keys: VaultKeys,
): Promise<Envelope> {
  const v = iv();
  return {
    ...keys.header,
    iv: b64(v),
    cipher: b64(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: v, additionalData: aadFor(keys.header) },
        keys.key,
        te.encode(JSON.stringify(doc)),
      ),
    ),
  };
}
export async function decryptDocument(
  e: Envelope,
  keys: VaultKeys,
): Promise<Document> {
  envelopeSchema.parse(e);
  if (e.vaultId !== keys.header.vaultId || e.owner !== keys.header.owner)
    throw Error(
      "Cofre diferente. Restaure o backup correto antes de sincronizar.",
    );
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: un64(e.iv), additionalData: aadFor(e) },
      keys.key,
      un64(e.cipher),
    );
    return documentSchema.parse(JSON.parse(td.decode(raw)));
  } catch {
    throw Error("Falha ao verificar a integridade do cofre.");
  }
}
