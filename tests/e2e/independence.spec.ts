import { expect, test, type Page } from "@playwright/test";
import type { Envelope } from "../../src/core/crypto";
import type { Document } from "../../src/core/model";
import {
  mockCloud,
  signInAccount,
  testAccountId,
  type Snapshot,
} from "./cloud-fixture";
import { navigateApp } from "./navigation";

test.setTimeout(120000);
test.use({ actionTimeout: 12000 });
const password = "independence-master-test-2026";
const otherAccountId = "e50147e3-af12-4c44-9aec-bab99eb8e7bb";

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const loaded = async (path: string) => {
      const resources = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .filter((url) => new URL(url).pathname === path);
      return import(resources.at(-1) || path);
    };
    const { repository } = await loaded("/src/services/storage/repository.ts");
    const { useFinance } = await loaded("/src/core/store.ts");
    const records = await repository.list();
    const queues = Object.fromEntries(
      await Promise.all(
        records.map(async (record: { owner: string }) => [
          record.owner,
          await repository.outbox(record.owner),
        ]),
      ),
    );
    return {
      records,
      queues,
      doc: useFinance.getState().doc as Document | null,
    };
  });
}

async function enterMaster(page: Page) {
  await page
    .getByLabel("Senha-mestra", { exact: false })
    .first()
    .fill(password);
  await page
    .getByRole("button", { name: "Desbloquear cofre", exact: true })
    .click();
}

async function finishCreation(page: Page) {
  await page
    .getByLabel("Senha-mestra", { exact: false })
    .first()
    .fill(password);
  await page.getByLabel("Confirme a senha", { exact: false }).fill(password);
  await page
    .getByRole("button", { name: "Criar cofre criptografado", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Guardei minha chave em um lugar seguro.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.locator("main.page-overview")).toBeVisible();
}

async function createAccountVault(page: Page) {
  await page.goto("/");
  await signInAccount(page);
  await finishCreation(page);
  await navigateApp(page, "Contas e saldos");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Adicionar conta",
    exact: true,
  });
  await dialog
    .getByLabel("Nome da conta", { exact: false })
    .fill("Conta privada da migração QA");
  await dialog
    .getByLabel("Instituição", { exact: false })
    .fill("Instituição de teste");
  await dialog.getByLabel("Saldo de abertura", { exact: false }).fill("1700");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).records.find(
          (r: { accountId?: string }) => r.accountId === testAccountId,
        )?.pending,
    )
    .toBe(false);
}

type LegacyFixture = { envelope: Envelope; doc: Document };
async function legacyBackup(
  page: Page,
  owner = "legacy-google-sub-migration-qa",
): Promise<LegacyFixture> {
  return page.evaluate(
    async ({ owner, password }) => {
      const cryptoPath = "/src/core/crypto.ts",
        modelPath = "/src/core/model.ts";
      const { createKeys, encryptDocument } = await import(cryptoPath);
      const { emptyDocument, today } = await import(modelPath);
      const doc = emptyDocument(),
        at = new Date().toISOString(),
        date = today();
      const add = (id: string, kind: string, data: Record<string, unknown>) =>
        doc.entities.push({
          id,
          kind,
          data,
          vector: { "legacy-device-qa": 1 },
          updatedAt: at,
        });
      add("legacy-account-qa", "account", {
        name: "Conta preservada QA",
        institution: "Banco de teste",
        balance: 10000,
        date,
      });
      add("legacy-income-qa", "transaction", {
        description: "Receita preservada QA",
        amount: 2000,
        type: "income",
        date,
        category: "Salário",
        accountId: "legacy-account-qa",
        payment: "pix",
        status: "confirmed",
      });
      add("legacy-expense-qa", "transaction", {
        description: "Despesa preservada QA",
        amount: 300,
        type: "expense",
        date,
        category: "Outros",
        accountId: "legacy-account-qa",
        payment: "debit",
        status: "confirmed",
      });
      add("legacy-goal-qa", "goal", {
        name: "Horizonte legado QA",
        horizonCategory: "travel",
        target: 2000,
        saved: 100,
        priority: 3,
        featured: true,
        cover: {
          type: "gallery",
          image: "travel-coast",
          x: 38,
          y: 44,
          zoom: 1.3,
        },
      });
      add("legacy-deposit-qa", "contribution", {
        goalId: "legacy-goal-qa",
        amount: 400,
        date,
        description: "Aporte preservado QA",
        status: "confirmed",
        sourceId: "legacy-account-qa",
        streamId: "primary",
      });
      add("legacy-withdrawal-qa", "contribution", {
        goalId: "legacy-goal-qa",
        amount: 100,
        date,
        description: "Retirada preservada QA",
        status: "confirmed",
        direction: "withdrawal",
        sourceId: "legacy-account-qa",
      });
      const { keys } = await createKeys(password, owner);
      return { envelope: await encryptDocument(doc, keys), doc };
    },
    { owner, password },
  );
}

async function importBackup(page: Page, envelope: Envelope) {
  await page.locator(".import-vault input").setInputFiles({
    name: "backup-legado-qa.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
}

async function decrypted(page: Page, envelope: Envelope): Promise<Document> {
  return page.evaluate(
    async ({ envelope, password }) => {
      const path = "/src/core/crypto.ts",
        { unlock, decryptDocument } = await import(path);
      return decryptDocument(envelope, await unlock(envelope, password));
    },
    { envelope, password },
  );
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

async function authenticatedModuleUrl(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/services/auth/client.ts";
    const urls = [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((resource) => resource.name)
          .filter((url) => new URL(url).pathname === path),
      ),
    ].reverse();
    for (const url of [...urls, path]) {
      if ((await import(url)).currentSession()) return url;
    }
    throw Error("A sessão autenticada do aplicativo não foi encontrada.");
  });
}

test("offline logout revokes local access until the same account reauthorizes without losing money", async ({
  page,
  context,
}) => {
  const operations: Snapshot[] = [];
  await mockCloud(context, operations);
  await createAccountVault(page);
  const before = await snapshot(page),
    original = before.records.find(
      (r: { accountId?: string }) => r.accountId === testAccountId,
    )!;
  await navigateApp(page, "Configurações");
  await context.setOffline(true);
  await page
    .getByRole("button", {
      name: "Sair da conta neste dispositivo",
      exact: true,
    })
    .click();
  await expect(page.locator(".independent-auth")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Desbloquear cofre/ }),
  ).toHaveCount(0);
  let current = (await snapshot(page)).records.find(
    (r: { owner: string }) => r.owner === original.owner,
  )!;
  expect(current.authorized).toBe(false);
  expect(current.session).toBeUndefined();
  expect(await decrypted(page, current.envelope)).toEqual(
    await decrypted(page, original.envelope),
  );
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Desbloquear cofre/ }),
  ).toHaveCount(0);
  await signInAccount(page);
  await enterMaster(page);
  await expect(page.locator("main.page-overview")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).records.find(
          (r: { owner: string }) => r.owner === original.owner,
        )?.authorized,
    )
    .toBe(true);
  current = (await snapshot(page)).records.find(
    (r: { owner: string }) => r.owner === original.owner,
  )!;
  expect(current.accountId).toBe(testAccountId);
  expect(current.envelope.vaultId).toBe(original.envelope.vaultId);
  expect(current.session?.cipher).toBeTruthy();
  expect(JSON.stringify(current)).not.toContain("TEST_ONLY_REFRESH_TOKEN");
  await navigateApp(page, "Contas e saldos");
  await expect(
    page.getByText("Conta privada da migração QA", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("R$ 1.700,00", { exact: true }).first(),
  ).toBeVisible();
  await noOverflow(page);
});

test("a different authenticated account cannot import or expose the prior account vault", async ({
  page,
  context,
}) => {
  await mockCloud(context);
  await createAccountVault(page);
  const original = (await snapshot(page)).records.find(
    (r: { accountId?: string }) => r.accountId === testAccountId,
  )!;
  await navigateApp(page, "Configurações");
  await page
    .getByRole("button", {
      name: "Sair da conta neste dispositivo",
      exact: true,
    })
    .click();
  await expect(page.locator(".independent-auth")).toBeVisible();
  await mockCloud(context, [], otherAccountId);
  await signInAccount(page);
  await importBackup(page, original.envelope);
  await expect(page.getByRole("alert")).toContainText(
    "associado a outra conta",
  );
  expect((await snapshot(page)).doc).toBeNull();
  await finishCreation(page);
  await navigateApp(page, "Contas e saldos");
  await expect(
    page.getByText("Conta privada da migração QA", { exact: true }),
  ).toHaveCount(0);
  const after = await snapshot(page),
    retained = after.records.find(
      (r: { owner: string }) => r.owner === original.owner,
    )!;
  expect(retained.accountId).toBe(testAccountId);
  expect(retained.authorized).toBe(false);
  expect(await decrypted(page, retained.envelope)).toEqual(
    await decrypted(page, original.envelope),
  );
  const own = after.records.find(
    (r: { accountId?: string }) => r.accountId === otherAccountId,
  )!;
  expect(own.owner).toBe(otherAccountId);
  expect(own.envelope.vaultId).not.toBe(original.envelope.vaultId);
  await noOverflow(page);
});

test("explicit local mode stays unlinked when importing with an authenticated session still in memory", async ({
  page,
  context,
}) => {
  const operations: Snapshot[] = [];
  await mockCloud(context, operations);
  await page.goto("/");
  const fixture = await legacyBackup(page);
  await signInAccount(page);
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Usar somente neste dispositivo",
      exact: true,
    })
    .click();
  await importBackup(page, fixture.envelope);
  await expect(page.getByText(/Modo local\. A sincronização/)).toBeVisible();
  await enterMaster(page);
  await expect(page.locator("main.page-overview")).toBeVisible();
  const record = (await snapshot(page)).records.find(
    (r: { owner: string }) => r.owner === fixture.envelope.owner,
  )!;
  expect(record.accountId).toBeUndefined();
  expect(record.session).toBeUndefined();
  expect(record.envelope.vaultId).toBe(fixture.envelope.vaultId);
  expect(operations).toHaveLength(0);
  await navigateApp(page, "Configurações");
  await expect(page.locator(".account-status")).toContainText(
    "Seu cofre está neste dispositivo",
  );
  await expect(
    page.getByRole("button", {
      name: "Sair da conta neste dispositivo",
      exact: true,
    }),
  ).toHaveCount(0);
  await noOverflow(page);
});

test("encrypted migration keeps legacy owner, identifiers, photo and goal movements across reload", async ({
  page,
  context,
}) => {
  const operations: Snapshot[] = [];
  await mockCloud(context, operations);
  await page.goto("/");
  const fixture = await legacyBackup(page);
  await signInAccount(page);
  await importBackup(page, fixture.envelope);
  await enterMaster(page);
  await expect(page.locator("main.page-overview")).toBeVisible();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).records.find(
          (r: { owner: string }) => r.owner === fixture.envelope.owner,
        )?.pending,
    )
    .toBe(false);
  let state = await snapshot(page),
    record = state.records.find(
      (r: { owner: string }) => r.owner === fixture.envelope.owner,
    )!;
  expect(record.accountId).toBe(testAccountId);
  expect(record.envelope.owner).toBe(fixture.envelope.owner);
  expect(record.envelope.vaultId).toBe(fixture.envelope.vaultId);
  const imported = await decrypted(page, record.envelope);
  for (const entity of fixture.doc.entities)
    expect(imported.entities.find((e) => e.id === entity.id)).toEqual(entity);
  expect(JSON.stringify(operations)).not.toContain("Horizonte legado QA");
  const cover = page
    .locator(".next-horizons")
    .getByRole("img", { name: "Capa de Horizonte legado QA", exact: true });
  await expect(cover).toHaveAttribute("src", "/covers/travel-coast.webp");
  await page.reload();
  await page.getByRole("button", { name: /Desbloquear cofre/ }).click();
  await enterMaster(page);
  await expect(page.locator("main.page-overview")).toBeVisible();
  await navigateApp(page, "Meus horizontes");
  const horizon = page.locator(".horizon-card").filter({
    has: page.getByRole("heading", {
      name: "Horizonte legado QA",
      exact: true,
    }),
  });
  await expect(horizon.locator(".goal-values strong")).toHaveText("R$ 400,00");
  await horizon
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Editar aporte Aporte preservado QA",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Editar retirada Retirada preservada QA",
      exact: true,
    }),
  ).toBeVisible();
  state = await snapshot(page);
  record = state.records.find(
    (r: { owner: string }) => r.owner === fixture.envelope.owner,
  )!;
  const reopened = await decrypted(page, record.envelope);
  for (const entity of fixture.doc.entities)
    expect(reopened.entities.find((e) => e.id === entity.id)).toEqual(entity);
  await noOverflow(page);
});

test("a remote vault appearing during import selection cannot replace either encrypted history", async ({
  page,
  context,
}) => {
  const operations: Snapshot[] = [];
  await mockCloud(context, operations);
  await page.goto("/");
  const fixture = await legacyBackup(page),
    remote = await legacyBackup(page, "another-remote-owner-qa");
  await signInAccount(page);
  const authUrl = await authenticatedModuleUrl(page);
  await page.evaluate(
    async ({ envelope, authUrl }) => {
      const auth = await import(authUrl);
      const { iv: _iv, cipher: _cipher, ...header } = envelope;
      void _iv;
      void _cipher;
      const response = await auth.client().rpc("horizon_exchange", {
        p_vault_id: envelope.vaultId,
        p_header: header,
        p_operations: [],
        p_cursor: 0,
        p_limit: 100,
      });
      if (response.error) throw response.error;
    },
    { envelope: remote.envelope, authUrl },
  );
  await importBackup(page, fixture.envelope);
  await enterMaster(page);
  await expect(page.getByRole("alert")).toContainText(
    "conta já possui outro cofre",
  );
  const state = await snapshot(page);
  expect(state.doc).toBeNull();
  expect(state.records).toHaveLength(0);
  expect(operations).toHaveLength(0);
  const remoteId = await page.evaluate(
    async (authUrl) =>
      (await (await import(authUrl)).remoteVault())?.header.vaultId,
    authUrl,
  );
  expect(remoteId).toBe(remote.envelope.vaultId);
  await noOverflow(page);
});

test("remote bootstrap preserves an unlinked legacy local document when exchange becomes unavailable", async ({
  page,
  context,
}) => {
  const operations: Snapshot[] = [];
  await mockCloud(context, operations);
  await page.goto("/");
  const fixture = await legacyBackup(page);
  await page.evaluate(
    async ({ envelope, password }) => {
      const repoPath = "/src/services/storage/repository.ts",
        cryptoPath = "/src/core/crypto.ts",
        authPath = "/src/services/auth/client.ts";
      const { repository } = await import(repoPath),
        { unlock, decryptDocument, encryptDocument } = await import(cryptoPath),
        auth = await import(authPath);
      await repository.put({
        owner: envelope.owner,
        envelope,
        device: "legacy-device-qa",
        seen: [],
        pending: true,
      });
      const keys = await unlock(envelope, password),
        doc = await decryptDocument(envelope, keys);
      const remoteDoc = {
        ...doc,
        entities: doc.entities.filter(
          (e: { kind: string }) => e.kind === "account",
        ),
      };
      const payload = await encryptDocument(remoteDoc, keys),
        { iv: _iv, cipher: _cipher, ...header } = envelope;
      void _iv;
      void _cipher;
      const response = await auth.client().rpc("horizon_exchange", {
        p_vault_id: envelope.vaultId,
        p_header: header,
        p_operations: [{ op_id: crypto.randomUUID(), payload }],
        p_cursor: 0,
        p_limit: 100,
      });
      if (response.error) throw response.error;
    },
    { envelope: fixture.envelope, password },
  );
  await page.reload();
  await signInAccount(page);
  await context.route(
    "https://myhorizon-test.supabase.co/rest/v1/rpc/horizon_exchange",
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "TEST_ONLY_EXCHANGE_UNAVAILABLE" },
      }),
  );
  await enterMaster(page);
  await expect(page.locator("main.page-overview")).toBeVisible();
  const state = await snapshot(page),
    record = state.records.find(
      (r: { owner: string }) => r.owner === fixture.envelope.owner,
    )!;
  const retained = await decrypted(page, record.envelope);
  for (const entity of fixture.doc.entities)
    expect(retained.entities.find((e) => e.id === entity.id)).toEqual(entity);
  expect(record.envelope.vaultId).toBe(fixture.envelope.vaultId);
  expect(record.pending).toBe(true);
  expect(state.queues[record.owner].length).toBeGreaterThan(0);
  await navigateApp(page, "Meus horizontes");
  await expect(
    page.getByRole("heading", { name: "Horizonte legado QA", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});
