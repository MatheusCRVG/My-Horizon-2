import { describe, expect, it } from "vitest";
import { createKeys, encryptDocument } from "../src/core/crypto";
import { emptyDocument } from "../src/core/model";
import {
  sealSession,
  unsealSession,
} from "../src/services/auth/session-crypto";
import { validateCloudConfig } from "../src/services/config";
import {
  validateRecord,
  type VaultRecord,
} from "../src/services/storage/repository";

describe("independent encrypted sessions and account boundaries", () => {
  it("persists only sealed credentials, randomizes IVs, and restores them with the vault key", async () => {
    const { keys } = await createKeys(
      "TEST_ONLY_MASTER_PASSWORD_2026",
      "legacy-google-subject",
    );
    const value = {
      access_token: "TEST_ONLY_ACCESS_TOKEN",
      refresh_token: "TEST_ONLY_REFRESH_TOKEN",
      userId: "account-A",
    };
    const first = await sealSession(value, keys),
      second = await sealSession(value, keys);
    expect(JSON.stringify(first)).not.toContain(value.access_token);
    expect(JSON.stringify(first)).not.toContain(value.refresh_token);
    expect(first.iv).not.toBe(second.iv);
    expect(await unsealSession(first, keys)).toEqual(value);
    await expect(
      unsealSession(first, {
        ...keys,
        header: { ...keys.header, owner: "another-owner" },
      }),
    ).rejects.toThrow();
    await expect(
      unsealSession(first, {
        ...keys,
        header: { ...keys.header, vaultId: crypto.randomUUID() },
      }),
    ).rejects.toThrow();
    const tampered = {
      ...first,
      cipher: `${first.cipher[0] === "A" ? "B" : "A"}${first.cipher.slice(1)}`,
    };
    await expect(unsealSession(tampered, keys)).rejects.toThrow();
  });
  it("rejects replacing a local account, vault, owner or cursor without changing the legacy identity", async () => {
    const { keys } = await createKeys(
      "TEST_ONLY_MASTER_PASSWORD_2026",
      "old-google-id",
    );
    const envelope = await encryptDocument(emptyDocument(), keys);
    const record: VaultRecord = {
      owner: "old-google-id",
      envelope,
      pending: true,
      device: "test-device",
      seen: [],
      accountId: "account-A",
      cursor: 12,
      authorized: true,
    };
    expect(() => validateRecord(record)).not.toThrow();
    expect(() =>
      validateRecord({ ...record, accountId: "account-B" }, record),
    ).toThrow();
    expect(() =>
      validateRecord(
        { ...record, envelope: { ...envelope, vaultId: crypto.randomUUID() } },
        record,
      ),
    ).toThrow();
    expect(() =>
      validateRecord({ ...record, owner: "renamed-id" }, record),
    ).toThrow();
    expect(() => validateRecord({ ...record, cursor: 11 }, record)).toThrow();
    expect(() => validateRecord({ ...record, cursor: NaN }, record)).toThrow();
    expect(() =>
      validateRecord({ ...record, cursor: 13 }, record),
    ).not.toThrow();
  });
});

describe("public server configuration", () => {
  const publicKey = "sb_publishable_TEST_ONLY_PUBLIC_KEY";
  it("accepts HTTPS and explicitly local development, without credentials or URL paths", () => {
    expect(
      validateCloudConfig({
        url: "https://my-project.supabase.co/",
        key: publicKey,
      }).url,
    ).toBe("https://my-project.supabase.co");
    expect(
      validateCloudConfig({ url: "http://127.0.0.1:54321", key: publicKey })
        .url,
    ).toBe("http://127.0.0.1:54321");
    for (const url of [
      "http://external.example",
      "https://user:password@my-project.supabase.co",
      "https://my-project.supabase.co/rest",
      "https://my-project.supabase.co/?secret=x",
    ]) {
      expect(() => validateCloudConfig({ url, key: publicKey })).toThrow();
    }
  });
  it("rejects service_role and secret keys, allowing the legacy public anon key", () => {
    const jwt = (role: string) =>
      `header.${btoa(JSON.stringify({ role }))}.signature`;
    for (const key of [
      "sb_secret_TEST_ONLY",
      jwt("service_role"),
      "invalid",
      "",
    ]) {
      expect(() =>
        validateCloudConfig({ url: "https://project.supabase.co", key }),
      ).toThrow();
    }
    expect(
      validateCloudConfig({
        url: "https://project.supabase.co",
        key: jwt("anon"),
      }).key,
    ).toBe(jwt("anon"));
  });
});
