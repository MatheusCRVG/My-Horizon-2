import { test, expect, type Page } from "@playwright/test";
import { today } from "../../src/core/model";
import { navigateApp } from "./navigation";

test.setTimeout(90000);
test.use({ actionTimeout: 12000 });
const password = "workspace-test-vault-2026";
const nav = navigateApp;

async function start(page: Page, real = false) {
  if (real) {
    await page.context().route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
      contentType: "application/javascript",
      body: "window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'WORKSPACE_TEST_ONLY',expires_in:3600})})}}};",
    }));
    await page.context().route("https://openidconnect.googleapis.com/v1/userinfo", (route) => route.fulfill({
      json: { sub: "workspace-test-owner", email: "workspace@example.invalid", name: "Workspace Test" },
    }));
    await page.context().route("https://www.googleapis.com/**", (route) => route.fulfill({
      json: route.request().method() === "POST" ? { id: "workspace-test-snapshot" } : { files: [] },
    }));
  }
  await page.goto("/");
  if (!real) {
    await page.getByRole("button", { name: "Explorar com dados fictícios", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Usar somente neste dispositivo", exact: true }).click();
    await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
    await page.getByLabel("Confirme a senha").fill(password);
    await page.getByRole("button", { name: "Criar cofre criptografado", exact: true }).click();
    await page.getByRole("checkbox", { name: "Guardei minha chave em um lugar seguro.", exact: true }).check();
    await page.getByRole("button", { name: "Começar", exact: true }).click();
  }
  await expect(page.locator("main.page-overview")).toBeVisible();
}

async function unlock(page: Page) {
  await page.getByRole("button", { name: /Desbloquear cofre/ }).click();
  await page.getByLabel("Senha-mestra", { exact: false }).fill(password);
  await page.getByRole("button", { name: "Desbloquear cofre", exact: true }).click();
  await expect(page.locator("main.page-overview")).toBeVisible();
}

async function addAccount(page: Page, name = "Conta Workspace", balance = "10000") {
  await nav(page, "Contas e saldos");
  await page.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Adicionar conta", exact: true });
  await dialog.getByLabel("Nome da conta").fill(name);
  await dialog.getByLabel("Instituição", { exact: false }).fill("Instituição cadastrada manualmente");
  await dialog.getByLabel("Saldo de abertura", { exact: false }).fill(balance);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function addTransaction(page: Page, data: { name: string; amount: string; type?: "income" | "expense"; account?: string; planned?: boolean }) {
  await nav(page, "Lançamentos");
  await page.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento", exact: true });
  await dialog.getByRole("button", { name: data.type === "income" ? "Receita" : "Despesa", exact: true }).click();
  await dialog.getByLabel("Descrição", { exact: false }).fill(data.name);
  await dialog.getByLabel("Valor (R$)", { exact: false }).fill(data.amount);
  if (data.account) await dialog.getByLabel("Conta bancária", { exact: false }).selectOption({ label: data.account });
  if (data.planned) await dialog.getByLabel("Situação", { exact: false }).selectOption("planned");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function ledger(page: Page) {
  return page.evaluate(async () => {
    const storePath = "/src/core/store.ts", financePath = "/src/core/finance.ts";
    const { accountBalance, totals } = await import(financePath);
    const moduleUrls = [...new Set(performance.getEntriesByType("resource").map((resource) => resource.name).filter((url) => new URL(url).pathname === storePath))].reverse();
    let currentStore;
    for (const url of [...moduleUrls, storePath]) {
      const candidate = await import(url);
      if (candidate.useFinance?.getState().doc) { currentStore = candidate; break; }
    }
    const doc = currentStore?.useFinance.getState().doc;
    if (!doc) throw Error("Não foi possível ler a sessão ativa do aplicativo.");
    return {
      entries: doc.entities.filter((e: { kind: string }) => e.kind !== "simulation").sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
      accounts: Object.fromEntries(doc.entities.filter((e: { kind: string; deleted?: boolean }) => e.kind === "account" && !e.deleted).map((e: { id: string }) => [e.id, accountBalance(doc, e.id)])),
      totals: totals(doc, new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0")),
    };
  });
}

test("five areas, dashboard preferences and privacy work in an encrypted vault across a new session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page, true);
  for (const label of ["Contas e saldos", "Meus horizontes", "Meu Futuro", "Horizon AI", "Visão geral"]) {
    await nav(page, label);
    await noOverflow(page);
  }
  await page.getByRole("button", { name: "Personalizar início", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Seu início, do seu jeito", exact: true });
  await dialog.getByRole("checkbox", { name: "Evolução e movimentações", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Mover pulse para cima", exact: true }).click();
  await dialog.getByRole("button", { name: "Salvar organização", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("[data-dashboard-section]").first()).toHaveAttribute("data-dashboard-section", /./);
  expect(await page.locator("[data-dashboard-section]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-dashboard-section")))).toEqual(["pulse", "horizons", "contributions", "guidance"]);
  await page.getByRole("button", { name: "Ocultar conteúdo financeiro", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Personalizar início", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar conteúdo financeiro", exact: true }).click();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Personalizar início", exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/workspace-home-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  await nav(page, "Bloquear e sair");
  await page.reload();
  await unlock(page);
  expect(await page.locator("[data-dashboard-section]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-dashboard-section")))).toEqual(["pulse", "horizons", "contributions", "guidance"]);
  await expect(page.locator(".horizon-pulse")).toContainText("Desde a última visita neste dispositivo");
  const encrypted = await page.evaluate(async () => {
    const request = indexedDB.open("financeiro5-encrypted");
    const database = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    return new Promise<string>((resolve) => {
      const query = database.transaction("vaults").objectStore("vaults").getAll();
      query.onsuccess = () => { resolve(JSON.stringify(query.result)); database.close(); };
    });
  });
  expect(encrypted).not.toContain('"pulse-state"');
  expect(encrypted).not.toContain('"dashboard"');
  expect(encrypted).not.toContain(password);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("local assistant uses real numbers and saved forecast scenarios never change the ledger", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page, true);
  await addAccount(page);
  await addTransaction(page, { name: "Renda Workspace", amount: "5000", type: "income" });
  await addTransaction(page, { name: "Despesa Workspace", amount: "1500" });
  await addTransaction(page, { name: "Compromisso Workspace", amount: "500", planned: true });
  const original = await ledger(page);
  expect(original.totals.balance).toBe(13500);
  await nav(page, "Horizon AI");
  await page.getByRole("button", { name: "Quanto posso economizar este mês?", exact: false }).click();
  const answer = page.locator(".assistant-conversation article").last();
  await expect(answer).toContainText("R$ 3.500,00");
  await expect(answer).toContainText("R$ 500,00");
  await expect(answer).toContainText("R$ 3.000,00");
  await expect(page.locator(".assistant-intro")).toContainText("sem modelo generativo conectado");
  await nav(page, "Análises e Horizon Score");
  await expect(page.locator(".score-panel")).toContainText("Dados insuficientes");
  await expect(page.locator(".score-panel")).toContainText("Não é uma pontuação oficial de crédito");
  await nav(page, "Meu Futuro");
  await page.getByLabel("Nome do cenário", { exact: true }).fill("Plano Workspace");
  await page.getByRole("button", { name: "1 ano", exact: true }).click();
  await page.getByLabel("Renda mensal (R$)", { exact: true }).fill("4000");
  await page.getByLabel("Despesas mensais (R$)", { exact: true }).fill("1000");
  await page.getByLabel("Aporte mensal em investimentos (R$)", { exact: false }).fill("500");
  await page.getByLabel("Patrimônio desejado (R$)", { exact: false }).fill("50000");
  await expect(page.locator(".future-hero > strong")).toHaveText("R$ 49.500,00");
  await page.getByRole("button", { name: "Comparar cenário", exact: true }).click();
  await page.getByLabel("Nome do cenário", { exact: true }).fill("Alternativa Workspace");
  await page.getByLabel("Renda mensal (R$)", { exact: true }).fill("3500");
  await expect(page.locator(".future-hero > strong")).toHaveText("R$ 43.500,00");
  await expect(page.locator(".future-case-buttons button")).toHaveCount(2);
  await page.getByRole("button", { name: "Salvar cenário no cofre", exact: true }).click();
  const saved = page.locator(".future-saved-row").filter({ hasText: "Alternativa Workspace" });
  await expect(saved).toBeVisible();
  await page.getByLabel("Renda mensal (R$)", { exact: true }).fill("1111");
  await saved.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(page.getByLabel("Renda mensal (R$)", { exact: true })).toHaveValue("3500");
  await noOverflow(page);
  await page.screenshot({ path: `artifacts/workspace-forecast-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  await nav(page, "Bloquear e sair");
  await unlock(page);
  await nav(page, "Meu Futuro");
  await expect(page.locator(".future-saved-row").filter({ hasText: "Alternativa Workspace" })).toBeVisible();
  expect((await ledger(page)).entries).toEqual(original.entries);
  expect((await ledger(page)).accounts).toEqual(original.accounts);
  expect(errors).toEqual([]);
});

test("goal dependencies, calendar, emergency reserve and journal share the same financial records", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  const original = await ledger(page);
  await nav(page, "Linha do tempo");
  let trip = page.locator(".life-card").filter({ has: page.getByRole("heading", { name: "Próxima viagem", exact: true }) });
  await trip.getByRole("button", { name: "Organizar", exact: true }).click();
  const sequence = page.getByRole("dialog", { name: "Organizar Próxima viagem", exact: true });
  await sequence.getByRole("checkbox", { name: /Reserva de emergência/ }).check();
  await sequence.getByLabel("Prioridade deste horizonte", { exact: false }).selectOption("3");
  await sequence.getByRole("button", { name: "Salvar sequência e prioridade", exact: true }).click();
  await expect(sequence).not.toBeVisible();
  await expect(trip.locator(".life-dependencies")).toContainText("Reserva de emergência");
  await nav(page, "Mapa dos horizontes");
  trip = page.locator(".life-card").filter({ has: page.getByRole("heading", { name: "Próxima viagem", exact: true }) });
  await expect(trip.locator(".life-stage")).toContainText("tem pré-requisitos");
  await trip.getByRole("button", { name: "Organizar", exact: true }).click();
  await expect(sequence.getByRole("checkbox", { name: /Reserva de emergência/ })).toBeChecked();
  await sequence.getByRole("button", { name: "Fechar", exact: true }).click();
  const reserveCard = page.locator(".life-card").filter({ has: page.getByRole("heading", { name: "Reserva de emergência", exact: true }) });
  await reserveCard.getByRole("button", { name: "Organizar", exact: true }).click();
  const circular = page.getByRole("dialog", { name: "Organizar Reserva de emergência", exact: true });
  await circular.getByRole("checkbox", { name: /Próxima viagem/ }).check();
  await expect(circular.getByRole("alert")).toBeVisible();
  await expect(circular.getByRole("button", { name: "Salvar sequência e prioridade", exact: true })).toBeDisabled();
  await circular.getByRole("button", { name: "Fechar", exact: true }).click();
  await noOverflow(page);
  await nav(page, "Calendário");
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(page.locator(".money-calendar-stats")).toContainText("Aportes previstos");
  await expect(page.locator(".money-event-list").first()).toBeVisible();
  await noOverflow(page);
  await nav(page, "Reserva de emergência");
  await page.getByLabel("Despesas essenciais", { exact: false }).selectOption("manual");
  await page.getByLabel("Valor essencial por mês (R$)", { exact: true }).fill("3000");
  await page.getByLabel("Meses de cobertura desejados", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Salvar planejamento da reserva", exact: true }).click();
  await expect(page.locator(".money-reserve-stats")).toContainText("R$ 18.000,00");
  await page.getByRole("button", { name: "Adicionar dinheiro", exact: true }).click();
  const deposit = page.getByRole("dialog", { name: /Registrar aporte/ });
  await deposit.getByLabel("Valor do aporte (R$)", { exact: true }).fill("100");
  await deposit.getByLabel("Descrição do aporte", { exact: true }).fill("Reserva Workspace");
  await deposit.getByRole("button", { name: "Confirmar aporte", exact: true }).click();
  await expect(deposit).not.toBeVisible();
  await expect(page.locator(".money-reserve-stats")).toContainText("R$ 18.100,00");
  await nav(page, "Meus horizontes");
  const horizon = page.locator(".horizon-card").filter({ has: page.getByRole("heading", { name: "Reserva de emergência", exact: true }) });
  await expect(horizon.locator(".goal-values strong")).toHaveText("R$ 18.100,00");
  expect((await ledger(page)).accounts).toEqual(original.accounts);
  await nav(page, "Diário e conquistas");
  await page.getByRole("button", { name: "Nova anotação", exact: true }).click();
  let diary = page.getByRole("dialog", { name: "Registrar anotação", exact: true });
  await diary.getByLabel("Título da anotação", { exact: false }).fill("Decisão Workspace");
  await diary.getByLabel("Sua história", { exact: false }).fill("Organizei prioridades sem criar uma nova despesa.");
  await diary.getByRole("button", { name: "Guardar anotação", exact: true }).click();
  let note = page.locator(".reflection-entry").filter({ hasText: "Decisão Workspace" });
  await note.getByRole("button", { name: "Editar", exact: true }).click();
  diary = page.getByRole("dialog", { name: "Editar anotação", exact: true });
  await diary.getByLabel("Título da anotação", { exact: false }).fill("Decisão Workspace revisada");
  await diary.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  note = page.locator(".reflection-entry").filter({ hasText: "Decisão Workspace revisada" });
  await expect(note).toBeVisible();
  await page.getByRole("button", { name: "Registrar conquista", exact: true }).click();
  diary = page.getByRole("dialog", { name: "Registrar conquista", exact: true });
  await diary.getByLabel("Nome da conquista", { exact: false }).fill("Primeiro passo Workspace");
  await diary.getByLabel("Sua história", { exact: false }).fill("Meu plano agora tem uma direção clara.");
  await diary.getByRole("button", { name: "Guardar conquista", exact: true }).click();
  await nav(page, "Retrospectiva anual");
  await expect(page.locator(".reflection-wrapped-stats")).toContainText("Aportes líquidos");
  await expect(page.getByRole("heading", { name: "Primeiro passo Workspace", exact: true })).toBeVisible();
  await noOverflow(page);
  await nav(page, "Diário e conquistas");
  await page.getByLabel("Buscar no diário", { exact: false }).fill("revisada");
  await expect(page.locator(".reflection-entry")).toHaveCount(1);
  await page.locator(".reflection-entry").getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByRole("dialog", { name: "Excluir este registro do diário?", exact: true }).getByRole("button", { name: "Excluir registro", exact: true }).click();
  await expect(page.locator(".reflection-entry")).toHaveCount(0);
  expect((await ledger(page)).accounts).toEqual(original.accounts);
  expect(errors).toEqual([]);
});

test("Connect stays honest and Inbox reconciles only explicitly reviewed imported and manual records", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await nav(page, "Horizon Connect");
  await expect(page.locator(".ci-status")).toHaveText("Conexão automática não configurada");
  await expect(page.locator(".ci-accounts")).toContainText("Cadastro manual · sem conexão automática");
  await expect(page.getByRole("button", { name: /^Conectar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Escolher OFX ou CSV", exact: false }).click();
  await expect(page.locator("main.page-import")).toBeVisible();
  await page.getByLabel("Conta padrão para extratos", { exact: false }).selectOption({ label: "Conta principal" });
  await page.locator(".upload-zone input").setInputFiles({
    name: "workspace.csv", mimeType: "text/csv", buffer: Buffer.from(`Data;Descricao;Valor\n${today()};Recebimento CSV Workspace;333,00\n`),
  });
  await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
  await expect(page.locator(".success-box")).toContainText("1 registro(s) importado(s)");
  await addTransaction(page, { name: "Compra duplicada Workspace", amount: "75", account: "Conta principal" });
  await addTransaction(page, { name: "Compra duplicada Workspace", amount: "75", account: "Conta principal" });
  await addTransaction(page, { name: "Saída própria Workspace", amount: "90", account: "Conta principal" });
  await addTransaction(page, { name: "Entrada própria Workspace", amount: "90", account: "Carteira", type: "income" });
  await nav(page, "Pendências");
  const duplicate = page.locator(".ci-review-card").filter({ hasText: "Compra duplicada Workspace" });
  await duplicate.getByRole("button", { name: "Revisar duplicidade", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Conferir possível duplicidade", exact: true });
  await expect(dialog.getByRole("button", { name: "Excluir registro duplicado", exact: true })).toBeDisabled();
  await dialog.getByRole("radio").nth(1).check();
  await dialog.getByRole("checkbox", { name: /Conferi os dados/ }).check();
  await dialog.getByRole("button", { name: "Excluir registro duplicado", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(duplicate).toHaveCount(0);
  const before = await ledger(page);
  await page.getByRole("button", { name: "Transferências", exact: true }).click();
  const transfer = page.locator(".ci-review-card").filter({ hasText: "R$ 90,00" });
  await transfer.getByRole("button", { name: "Revisar par", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Conferir transferência própria", exact: true });
  await expect(dialog).toContainText("Saída própria Workspace");
  await expect(dialog).toContainText("Entrada própria Workspace");
  await expect(dialog.getByRole("button", { name: "Confirmar transferência própria", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /As duas contas são minhas/ }).check();
  await dialog.getByRole("button", { name: "Confirmar transferência própria", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await ledger(page);
  expect(after.accounts).toEqual(before.accounts);
  expect(after.totals.netWorth).toBe(before.totals.netWorth);
  expect(after.totals.income).toBe(before.totals.income - 90);
  expect(after.totals.expense).toBe(before.totals.expense - 90);
  await page.getByRole("button", { name: "Categorias", exact: true }).click();
  await page.getByRole("button", { name: "Categorizar Recebimento CSV Workspace", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Editar lançamento", exact: true });
  await dialog.getByLabel("Categoria", { exact: false }).first().selectOption("Renda extra");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Categorizar Recebimento CSV Workspace", exact: true })).toHaveCount(0);
  await noOverflow(page);
  await nav(page, "Horizon Connect");
  await expect(page.locator(".ci-import-note")).toContainText("não informa quando um extrato foi importado");
  await expect(page.locator(".ci-status")).toHaveText("Conexão automática não configurada");
  await page.screenshot({ path: `artifacts/workspace-connect-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  await noOverflow(page);
  expect(errors).toEqual([]);
});
