import type { VaultKeys } from "../../core/crypto";
import type { SealedSession } from "../storage/repository";
const encoder = new TextEncoder();
const aad = (keys: VaultKeys) =>
  encoder.encode(
    `myhorizon:session:v1:${keys.header.owner}:${keys.header.vaultId}`,
  );
const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function sealSession(
  value: unknown,
  keys: VaultKeys,
): Promise<SealedSession> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(keys) },
    keys.key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: encode(iv), cipher: encode(new Uint8Array(cipher)) };
}
export async function unsealSession<T>(
  value: SealedSession,
  keys: VaultKeys,
): Promise<T> {
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(value.iv), additionalData: aad(keys) },
    keys.key,
    decode(value.cipher),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
