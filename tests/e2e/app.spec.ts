import { navigateApp } from "./navigation";
import { beginDirectHorizon, finishDirectHorizon } from "./horizon-wizard";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import type { Envelope } from "../../src/core/crypto";
import { addMonths, today } from "../../src/core/model";
import { mockCloud, signInAccount, type Snapshot } from "./cloud-fixture";
const password = "cofre-teste-seguro-123";
const nav = navigateApp;
async function createVault(page: Page) {
  await page.goto("/");
  await signInAccount(page);
  await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
  await page.getByLabel("Confirme a senha").fill(password);
  await page.getByRole("button", { name: "Criar cofre criptografado" }).click();
  await expect(
    page.getByRole("heading", { name: "Guarde sua chave de recuperação" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Guardei minha chave em um lugar seguro." })
    .check();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
}
async function addAccount(page: Page, name = "Banco Teste", balance = "1000") {
  await nav(page, "Contas e saldos");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Nome da conta").fill(name);
  await d.getByLabel("Instituição").fill("Instituição teste");
  await d.getByLabel("Saldo de abertura").fill(balance);
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(d).not.toBeVisible();
}
test("demo is isolated and responsive across all modules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `artifacts/overview-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page).toHaveTitle(/My Horizon\+/);
  if (await page.locator(".mobile-menu").isVisible()) {
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.getByRole("button", { name: /Buscar no My Horizon/ }).click();
  } else await page.keyboard.press("Control+k");
  await page
    .getByRole("textbox", { name: "Busca global", exact: true })
    .fill("Salário");
  await page
    .locator(".search-results button")
    .filter({ hasText: "Lançamento" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Editar lançamento", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Descrição", { exact: false })).toHaveValue(
    "Salário",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar receita", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Receita", exact: true }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar despesa", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Despesa", exact: true }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Como usar o My Horizon+", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /1\. Cadastre suas contas/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Contas e saldos", exact: true }),
  ).toBeVisible();
  for (const [name, title] of [
    ["Lançamentos", "Lançamentos"],
    ["Cartões de crédito", "Cartões de crédito"],
    ["Meus horizontes", "Meus horizontes"],
    ["Investimentos", "Investimentos e patrimônio"],
    ["Viagens", "Horizontes de viagem"],
    ["Simuladores", "Simuladores"],
    ["Relatórios", "Relatórios e projeções"],
    ["Importar dados", "Importar dados"],
    ["Configurações", "Configurações"],
  ]) {
    await nav(page, name);
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explorar com dados fictícios" }),
  ).toBeVisible();
});
test("real vault persists encrypted, records CRUD and offline unlock works", async ({
  page,
  context,
}) => {
  const snapshots: Snapshot[] = [];
  await mockCloud(context, snapshots);
  await createVault(page);
  await addAccount(page);
  await nav(page, "Lançamentos");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByLabel("Descrição", { exact: false })
    .fill("Despesa confidencial");
  await d.getByLabel("Valor (R$)").fill("50");
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(
    page.getByText("Despesa confidencial", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Despesa confidencial" })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Valor (R$)").fill("65");
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("R$ 65,00", { exact: false }).first(),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const req = indexedDB.open("financeiro5-encrypted");
    const db = await new Promise<IDBDatabase>(
      (r) => (req.onsuccess = () => r(req.result)),
    );
    const tx = db.transaction("vaults");
    return new Promise<string>((r) => {
      const q = tx.objectStore("vaults").getAll();
      q.onsuccess = () => r(JSON.stringify(q.result));
    });
  });
  expect(stored).not.toContain("Despesa confidencial");
  expect(stored).not.toContain(password);
  await nav(page, "Configurações");
  await page
    .getByRole("button", { name: "Sincronizar", exact: true })
    .last()
    .click();
  await expect.poll(() => snapshots.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshots)).not.toContain("Despesa confidencial");
  await page.getByRole("button", { name: "Bloquear agora" }).click();
  await page.getByRole("button", { name: /Desbloquear cofre/ }).click();
  await page
    .getByLabel("Senha-mestra", { exact: false })
    .fill("senha-incorreta");
  await page
    .getByRole("button", { name: "Desbloquear cofre", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Senha ou chave incorreta" }),
  ).toBeVisible();
  await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
  await page
    .getByRole("button", { name: "Desbloquear cofre", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await nav(page, "Lançamentos");
  await expect(
    page.getByText("Despesa confidencial", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Excluir Despesa confidencial" })
    .click();
  await page
    .getByRole("button", { name: "Excluir registro", exact: true })
    .click();
  await expect(
    page.getByText("Despesa confidencial", { exact: true }),
  ).not.toBeVisible();
});
test("installments and invoice payment leave monthly expense counted once", async ({
  page,
  context,
}) => {
  await mockCloud(context);
  await createVault(page);
  await addAccount(page);
  await nav(page, "Cartões de crédito");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Nome do cartão").fill("Cartão teste");
  await d.getByLabel("Instituição").fill("Banco");
  await d.getByLabel("Limite de crédito").fill("2000");
  await d.getByLabel("Dia de fechamento").fill("28");
  await d.getByLabel("Dia de vencimento").fill("30");
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await nav(page, "Lançamentos");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Forma de pagamento").selectOption("credit");
  await d.getByLabel("Descrição", { exact: false }).fill("Compra parcelada");
  await d.getByLabel("Valor total da compra").fill("300");
  await d.getByLabel("Número de parcelas").fill("3");
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByText("Parcela 1/3")).toBeVisible();
  await nav(page, "Cartões de crédito");
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(d).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pagar fatura" }),
  ).toBeDisabled();
  await nav(page, "Lançamentos");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Despesas confirmadas" })
      .getByText("R$ 100,00", { exact: true }),
  ).toBeVisible();
  await nav(page, "Contas e saldos");
  await expect(page.getByText("R$ 900,00", { exact: true })).toBeVisible();
});

test("a new device restores encrypted PostgreSQL operations and merges changes", async ({
  page,
  context,
  browser,
}) => {
  const snapshots: Snapshot[] = [];
  await mockCloud(context, snapshots);
  await createVault(page);
  await addAccount(page, "Conta sincronizada", "2500");
  await nav(page, "Meus horizontes");
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .first()
    .click();
  let savingDialog = await beginDirectHorizon(page);
  await savingDialog.getByLabel("Nome do objetivo").fill("Meta sincronizada");
  await savingDialog
    .getByLabel("Valor desejado (R$)", { exact: true })
    .fill("3000");
  await savingDialog
    .getByLabel("Prazo desejado", { exact: false })
    .fill(addMonths(today(), 12));
  await savingDialog
    .getByText("Personalizar foto e destaque", { exact: true })
    .click();
  await savingDialog
    .getByLabel("Enviar foto da capa", { exact: true })
    .setInputFiles("public/covers/study-books.webp");
  await expect(savingDialog.locator(".cover-preview img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await finishDirectHorizon(page);
  await expect(savingDialog).not.toBeVisible();
  const uploadedCover = await page
    .locator(".horizon-card .horizon-cover img")
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Planejar aportes", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  savingDialog = page.getByRole("dialog");
  await savingDialog
    .getByLabel("Valor do aporte (R$)", { exact: true })
    .fill("500");
  await savingDialog
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Aporte sincronizado");
  await savingDialog
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(savingDialog).not.toBeVisible();
  await nav(page, "Contas e saldos");
  await page.getByRole("button", { name: "Sincronizar", exact: true }).click();
  await expect.poll(() => snapshots.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshots)).not.toContain("Aporte sincronizado");
  await expect(page.locator(".sync-label")).toContainText(
    "Online — Sincronizado",
  );
  const second = await browser.newContext({
    viewport: page.viewportSize() ?? undefined,
  });
  await mockCloud(second, snapshots);
  const phone = await second.newPage();
  try {
    await phone.goto("/");
    await signInAccount(phone);
    await phone.getByLabel("Senha-mestra", { exact: false }).fill(password);
    await phone
      .getByRole("button", { name: "Desbloquear cofre", exact: true })
      .click();
    await nav(phone, "Contas e saldos");
    await expect(
      phone.getByText("Conta sincronizada", { exact: true }),
    ).toBeVisible();
    await nav(phone, "Meus horizontes");
    await expect(phone.locator(".saving-card .goal-values strong")).toHaveText(
      "R$ 500,00",
    );
    await expect(phone.locator(".horizon-card-facts")).toContainText(
      "R$ 500,00",
    );
    expect(
      (await phone
        .locator(".horizon-card .horizon-cover img")
        .getAttribute("src")) === uploadedCover,
    ).toBe(true);
    await phone
      .getByRole("button", { name: "Ver horizonte", exact: true })
      .click();
    await phone
      .getByRole("button", {
        name: "Editar aporte Aporte sincronizado",
        exact: true,
      })
      .click();
    await phone
      .getByRole("dialog")
      .getByLabel("Valor do aporte (R$)", { exact: true })
      .fill("600");
    await phone
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar aporte", exact: true })
      .click();
    await nav(phone, "Contas e saldos");
    await phone
      .getByRole("button", { name: "Editar Conta sincronizada" })
      .click();
    const dialog = phone.getByRole("dialog");
    await dialog
      .getByLabel("Nome da conta")
      .fill("Conta atualizada no celular");
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
    await phone
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(phone.locator(".sync-label")).toContainText(
      "Online — Sincronizado",
    );
    await page
      .getByRole("button", { name: "Sincronizar", exact: true })
      .click();
    await expect(
      page.getByText("Conta atualizada no celular", { exact: true }),
    ).toBeVisible();
    await nav(page, "Meus horizontes");
    await expect(page.locator(".saving-card .goal-values strong")).toHaveText(
      "R$ 600,00",
    );
  } finally {
    await second.close();
  }
});
