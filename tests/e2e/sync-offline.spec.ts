import { test, expect } from "@playwright/test";
import { mockCloud, signInAccount } from "./cloud-fixture";
import { navigateApp } from "./navigation";

test("a slow exchange never blocks local offline writes and reconnect sends each operation once", async ({
  page,
  context,
}) => {
  const cloud = await mockCloud(context);
  await page.goto("/");
  await signInAccount(page);
  await page
    .getByLabel("Senha-mestra", { exact: false })
    .fill("TEST_ONLY_MASTER_PASSWORD_2026");
  await page
    .getByLabel("Confirme a senha", { exact: false })
    .fill("TEST_ONLY_MASTER_PASSWORD_2026");
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
  await expect(page.locator(".sync-label")).toContainText(
    "Online — Sincronizado",
  );
  const originalCount = cloud.operations.length;
  let release!: () => void,
    requests = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint =
    "https://myhorizon-test.supabase.co/rest/v1/rpc/horizon_exchange";
  const blocker = async (route: import("@playwright/test").Route) => {
    requests++;
    await gate;
    await route.fallback().catch(() => {});
  };
  await context.route(endpoint, blocker);
  try {
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect.poll(() => requests).toBeGreaterThan(0);
    await navigateApp(page, "Contas e saldos");
    await page
      .getByRole("button", { name: "Adicionar", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Nome da conta", { exact: false })
      .fill("Gravada sem esperar a rede");
    await dialog
      .getByLabel("Instituição", { exact: false })
      .fill("Cadastro manual");
    await dialog.getByLabel("Saldo de abertura", { exact: false }).fill("1000");
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 4000 });
    await context.setOffline(true);
    await expect(page.locator(".sync-label")).toContainText("Offline");
    await expect(
      page.getByText("Gravada sem esperar a rede", { exact: true }),
    ).toBeVisible();
    expect(cloud.operations).toHaveLength(originalCount);
    const pendingCount = await page.evaluate(async () => {
      const path = "/src/services/storage/repository.ts";
      const { repository } = await import(path);
      const [record] = await repository.list();
      return (await repository.outbox(record.owner)).length;
    });
    expect(pendingCount).toBeGreaterThan(0);
    release();
    await context.unroute(endpoint, blocker);
    await context.setOffline(false);
    await expect(page.locator(".sync-label")).toContainText(
      "Online — Sincronizado",
    );
    await expect
      .poll(() => cloud.operations.length)
      .toBe(originalCount + pendingCount);
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(page.locator(".sync-label")).toContainText(
      "Online — Sincronizado",
    );
    expect(cloud.operations).toHaveLength(originalCount + pendingCount);
    expect(
      new Set(cloud.operations.map((operation) => operation.id)).size,
    ).toBe(cloud.operations.length);
  } finally {
    release();
  }
});
