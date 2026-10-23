import { chromium, expect } from "@playwright/test";
import { navigateWorkspace } from "./navigate-workspace.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  await context.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'TEST_ONLY',expires_in:3600})})}}};`,
    }),
  );
  await context.route("https://openidconnect.googleapis.com/v1/userinfo", (r) =>
    r.fulfill({
      json: {
        sub: "savings-offline-test",
        email: "savings@example.invalid",
        name: "Savings test",
      },
    }),
  );
  await context.route("https://www.googleapis.com/**", (r) =>
    r.fulfill({
      json:
        r.request().method() === "POST" ? { id: "test-folder" } : { files: [] },
    }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.F5_PREVIEW_URL || "http://localhost:4173");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole("button", { name: "Usar somente neste dispositivo" }).click();
  await page
    .getByLabel("Senha-mestra", { exact: false })
    .fill("savings-offline-test-123");
  await page.getByLabel("Confirme a senha").fill("savings-offline-test-123");
  await page.getByRole("button", { name: "Criar cofre criptografado" }).click();
  await page
    .getByRole("checkbox", { name: "Guardei minha chave em um lugar seguro." })
    .check();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  const nav = (name) => navigateWorkspace(page, name);
  await nav("Contas e saldos");
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .first()
    .click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Nome da conta").fill("Saldo para reservar");
  await d.getByLabel("Instituição").fill("Teste");
  await d.getByLabel("Saldo de abertura").fill("2000");
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(d).not.toBeVisible();
  await nav("Meus horizontes");
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Casa", exact: true }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d.getByRole("button", { name: /^Definir valor/ }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d.getByLabel("Nome do objetivo").fill("Meta offline");
  await d.getByLabel("Valor desejado (R$)", { exact: true }).fill("1200");
  await d.getByLabel("Prazo desejado", { exact: false }).fill("2027-12-31");
  await d.getByText("Personalizar foto e destaque", { exact: true }).click();
  await d
    .getByLabel("Enviar foto da capa", { exact: true })
    .setInputFiles("public/covers/home-interior.webp");
  await expect(d.locator(".cover-preview img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  const cover = await d.locator(".cover-preview img").getAttribute("src");
  await d.getByRole("button", { name: "Ampliar foto", exact: true }).click();
  const crop = d.getByRole("group", {
    name: "Enquadramento da foto",
    exact: true,
  });
  await crop.focus();
  await crop.press("ArrowLeft");
  await crop.press("ArrowDown");
  const focalX = await crop.getAttribute("data-focus-x"),
    focalY = await crop.getAttribute("data-focus-y");
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d.getByRole("button", { name: "Definir depois", exact: true }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await page
    .getByRole("button", { name: "Planejar aportes", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  async function add(amount) {
    await page
      .getByRole("button", { name: "Adicionar dinheiro", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Valor do aporte (R$)", { exact: true })
      .fill(amount);
    await dialog
      .getByLabel("Descrição do aporte", { exact: true })
      .fill("Reserva offline");
    await dialog
      .getByRole("button", { name: "Confirmar aporte", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  }
  await add("300");
  await nav("Bloquear e sair");
  await context.setOffline(true);
  await page.reload();
  expect(
    await page.evaluate(
      async () => !!(await caches.match("/previews/horizons-demo.png")),
    ),
  ).toBe(true);
  async function unlock() {
    await page.getByRole("button", { name: /Desbloquear cofre/ }).click();
    await page
      .getByLabel("Senha-mestra", { exact: false })
      .fill("savings-offline-test-123");
    await page
      .getByRole("button", { name: "Desbloquear cofre", exact: true })
      .click();
    await nav("Meus horizontes");
    const img = page
      .locator(".horizon-card")
      .filter({
        has: page.getByRole("heading", { name: "Meta offline", exact: true }),
      })
      .locator(".horizon-cover img");
    await expect(img).toHaveAttribute("src", cover);
    const rendered = img.locator("..");
    await expect(rendered).toHaveAttribute("data-framing", "focal");
    await expect(rendered).toHaveAttribute("data-focus-x", focalX);
    await expect(rendered).toHaveAttribute("data-focus-y", focalY);
    await expect(rendered).toHaveAttribute("data-zoom", "1.2");
    await img.evaluate((image) => image.decode());
    await expect
      .poll(() => img.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
  }
  await unlock();
  await expect(page.locator(".saving-card .goal-values strong")).toHaveText(
    "R$ 300,00",
  );
  await add("200");
  await expect(page.locator(".saving-card .goal-values strong")).toHaveText(
    "R$ 500,00",
  );
  await nav("Bloquear e sair");
  await page.reload();
  await unlock();
  await expect(page.locator(".saving-card .goal-values strong")).toHaveText(
    "R$ 500,00",
  );
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .click();
  d = page.getByRole("dialog", { name: "Criar horizonte", exact: true });
  await d.getByRole("button", { name: "Carro", exact: true }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d.getByRole("button", { name: /^Planejar meu horizonte/ }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d
    .getByLabel("Nome do objetivo", { exact: true })
    .fill("Carro offline planejado");
  await d
    .getByLabel("Modelo do carro", { exact: true })
    .fill("Modelo pessoal sem cotação");
  await d
    .getByLabel("Valor estimado do veículo (R$)", { exact: true })
    .fill("10000");
  await d
    .getByLabel("Despesas iniciais opcionais (R$)", { exact: true })
    .fill("500");
  await d
    .getByLabel("Reserva adicional opcional (R$)", { exact: true })
    .fill("500");
  await d
    .getByLabel("Quanto já possui guardado (R$)", { exact: true })
    .fill("100");
  await expect(d.locator(".budget-total strong")).toHaveText("R$ 11.000,00");
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d.getByRole("button", { name: "Continuar", exact: true }).click();
  await d
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await nav("Bloquear e sair");
  await page.reload();
  await unlock();
  let car = page.locator(".horizon-card").filter({
    has: page.getByRole("heading", {
      name: "Carro offline planejado",
      exact: true,
    }),
  });
  await expect(car.locator(".goal-values strong")).toHaveText("R$ 100,00");
  await car.getByRole("button", { name: "Ver horizonte", exact: true }).click();
  await expect(page.locator(".horizon-my-planning")).toContainText(
    "Modelo pessoal sem cotação",
  );
  await page
    .getByRole("button", { name: "Editar planejamento", exact: true })
    .click();
  d = page.getByRole("dialog", { name: "Meu Planejamento", exact: true });
  await expect(
    d.getByLabel("Valor estimado do veículo (R$)", { exact: true }),
  ).toHaveValue("10000");
  await d
    .getByLabel("Valor estimado do veículo (R$)", { exact: true })
    .fill("12000");
  await d
    .getByRole("button", { name: "Revisar alteração", exact: false })
    .click();
  d = page.getByRole("dialog", {
    name: "Confirmar novo planejamento",
    exact: true,
  });
  await d
    .getByRole("button", { name: "Confirmar atualização", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".horizon-detail-values")).toContainText(
    "R$ 13.000,00",
  );
  await expect(
    page.locator(".horizon-detail-values > div").first(),
  ).toContainText("R$ 100,00");
  await nav("Bloquear e sair");
  await page.reload();
  await unlock();
  car = page.locator(".horizon-card").filter({
    has: page.getByRole("heading", {
      name: "Carro offline planejado",
      exact: true,
    }),
  });
  await expect(car.locator(".goal-values span")).toContainText("R$ 13.000,00");
  await expect(car.locator(".goal-values strong")).toHaveText("R$ 100,00");
  expect(errors).toEqual([]);
  await nav("Meu Futuro");
  await expect(page.locator(".future-root")).toBeVisible();
  await nav("Calendário");
  await expect(
    page.getByRole("heading", {
      name: "Um mês com mais clareza.",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      productionPWA: true,
      offlineReload: true,
      encryptedContributionsRestored: true,
      offlineContributionSavedAndRestored: true,
      encryptedCoverRestoredOffline: true,
      focalFramingRestoredOffline: true,
      demoPreviewAvailableOffline: true,
      encryptedHorizonBudgetCreatedAndRevisedOffline: true,
      lazyPlanningModulesAvailableOffline: true,
      pageErrors: 0,
    }),
  );
} finally {
  await browser.close();
}
