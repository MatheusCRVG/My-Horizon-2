import { navigateApp } from "./navigation";
import { beginDirectHorizon, finishDirectHorizon } from "./horizon-wizard";
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
test.setTimeout(60000);
const nav = navigateApp;
const namedCard = (page: Page, name: string) =>
  page
    .locator(".horizon-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
test("photo horizons stay consistent across dashboard, details, deposits, withdrawals, filters and archiving", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/My Horizon\+/);
  await expect(page.locator(".auth-mobile-brand")).toHaveAttribute(
    "src",
    "/brand/logo.svg",
  );
  await page
    .getByRole("button", { name: "Explorar com dados fictícios" })
    .click();
  await nav(page, "Meus horizontes");
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .click();
  let d = await beginDirectHorizon(page, "Casa");
  await d.getByLabel("Nome do objetivo").fill("Minha casa de teste");
  await d.getByLabel("Valor desejado (R$)", { exact: true }).fill("1000");
  await d.getByText("Personalizar foto e destaque", { exact: true }).click();
  await d.getByLabel("Enviar foto da capa", { exact: true }).setInputFiles({
    name: "invalida.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(d.getByRole("alert")).toContainText("JPG, PNG ou WebP");
  await d
    .getByLabel("Enviar foto da capa", { exact: true })
    .setInputFiles(path.resolve("public/covers/home-modern.webp"));
  await expect(d.locator(".cover-preview img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await d.getByRole("button", { name: "Ampliar foto", exact: true }).click();
  const crop = d.getByRole("group", {
    name: "Enquadramento da foto",
    exact: true,
  });
  await crop.focus();
  await crop.press("ArrowLeft");
  await crop.press("ArrowDown");
  const focusX = await crop.getAttribute("data-focus-x"),
    focusY = await crop.getAttribute("data-focus-y");
  await finishDirectHorizon(page);
  await expect(d).not.toBeVisible();
  let c = namedCard(page, "Minha casa de teste");
  await expect(c).toContainText("sem prazo");
  const photo = await c.locator(".horizon-cover img").getAttribute("src");
  expect(photo!.length).toBeLessThan(300000);
  await expect(c.locator(".horizon-cover")).toHaveAttribute(
    "data-focus-x",
    focusX!,
  );
  await expect(c.locator(".horizon-cover")).toHaveAttribute(
    "data-focus-y",
    focusY!,
  );
  await expect(c.locator(".horizon-cover")).toHaveAttribute("data-zoom", "1.2");
  await c
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Valor do aporte (R$)", { exact: true }).fill("250");
  await d
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await expect(c.locator(".goal-values strong")).toHaveText("R$ 250,00");
  await nav(page, "Visão geral");
  c = namedCard(page, "Minha casa de teste");
  expect(
    (await c.locator(".horizon-cover img").getAttribute("src")) === photo,
  ).toBe(true);
  await expect(c.locator(".goal-values strong")).toHaveText("R$ 250,00");
  await c.getByRole("button", { name: "Ver horizonte", exact: true }).click();
  d = page.getByRole("dialog", { name: "Seu horizonte", exact: true });
  expect(
    (await d.locator(".horizon-detail-cover img").getAttribute("src")) ===
      photo,
  ).toBe(true);
  await d
    .getByRole("button", { name: "Registrar retirada", exact: true })
    .click();
  const withdrawal = page.getByRole("dialog", {
    name: "Registrar retirada",
    exact: true,
  });
  await withdrawal.getByLabel("Valor da retirada").fill("50");
  await withdrawal
    .getByRole("button", { name: "Confirmar retirada", exact: true })
    .click();
  await expect(withdrawal).not.toBeVisible();
  await expect(d.locator(".horizon-detail-values > div").first()).toContainText(
    "R$ 200,00",
  );
  await expect(d.locator(".saving-table-wrap").first()).toContainText(
    "Retirada",
  );
  await expect(d.locator(".horizon-rhythm")).toContainText(
    "Sem prazo definido",
  );
  await d
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  let child = page.getByRole("dialog", {
    name: "Registrar aporte",
    exact: true,
  });
  await child.getByLabel("Valor do aporte (R$)", { exact: true }).fill("900");
  await child
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(child).not.toBeVisible();
  await expect(d.locator(".horizon-completion")).toContainText(
    "Você chegou lá",
  );
  await expect(d.locator(".horizon-detail-values")).toContainText("R$ 100,00");
  await d
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  child = page.getByRole("dialog", { name: "Editar horizonte", exact: true });
  await child.getByLabel("Valor alvo").fill("1200");
  await child.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(child).not.toBeVisible();
  await d.getByRole("button", { name: "Arquivar", exact: true }).click();
  child = page.getByRole("dialog", { name: /^Arquivar horizonte/ });
  await child
    .getByRole("button", { name: "Arquivar horizonte", exact: true })
    .click();
  await expect(child).not.toBeVisible();
  await expect(d.locator(".horizon-detail-heading")).toContainText(
    "HORIZONTE ARQUIVADO",
  );
  await d
    .getByRole("button", { name: "Voltar aos horizontes", exact: true })
    .click();
  await expect(namedCard(page, "Minha casa de teste")).toHaveCount(0);
  await nav(page, "Meus horizontes");
  await page.getByRole("button", { name: "Arquivados", exact: true }).click();
  await page.getByLabel("Buscar horizonte", { exact: true }).fill("Minha casa");
  await page.getByLabel("Categoria", { exact: true }).selectOption("home");
  await expect(page.locator(".horizon-summary .stat").first()).toContainText(
    "R$ 1.100,00",
  );
  await expect(page.locator(".horizon-summary .stat").nth(1)).toContainText(
    "R$ 100,00",
  );
  c = namedCard(page, "Minha casa de teste");
  await c.getByRole("button", { name: "Ver horizonte", exact: true }).click();
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restaurar horizonte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Foto de capa", exact: true }).click();
  await d
    .getByRole("button", { name: "Usar capa com ícone", exact: true })
    .click();
  await d.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".horizon-detail-cover img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Excluir horizonte", exact: true })
    .click();
  d = page.getByRole("dialog", { name: "Excluir registro?", exact: true });
  await d
    .getByRole("button", { name: "Excluir registro", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Este horizonte não está mais disponível",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Voltar aos horizontes", exact: true })
    .click();
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(namedCard(page, "Minha casa de teste")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("dashboard favorites reorder and gallery covers are shared with the objective list", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios" })
    .click();
  await page
    .getByRole("button", {
      name: "Personalizar horizontes do dashboard",
      exact: true,
    })
    .click();
  let d = page.getByRole("dialog");
  await d
    .getByRole("button", {
      name: "Mover Um novo destino para cima",
      exact: true,
    })
    .click();
  await d
    .getByRole("button", {
      name: "Mover Um novo destino para cima",
      exact: true,
    })
    .click();
  await d
    .getByRole("checkbox", { name: "Próxima viagem", exact: true })
    .uncheck();
  await d
    .getByRole("button", { name: "Salvar destaques", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await expect(
    page.locator(".next-horizons .horizon-card h3").first(),
  ).toHaveText("Um novo destino");
  await expect(namedCard(page, "Próxima viagem")).toHaveCount(0);
  await nav(page, "Meus horizontes");
  const c = namedCard(page, "Reserva de emergência");
  await c.getByRole("button", { name: "Ver horizonte", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Foto de capa", exact: true }).click();
  await d.getByRole("button", { name: "Reserva", exact: true }).click();
  await d
    .getByRole("button", { name: "Escolher capa Reserva 2", exact: true })
    .click();
  await d.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".horizon-detail-cover img")).toHaveAttribute(
    "src",
    "/covers/reserve-forest.webp",
  );
  await nav(page, "Visão geral");
  await expect(
    namedCard(page, "Reserva de emergência").locator(".horizon-cover img"),
  ).toHaveAttribute("src", "/covers/reserve-forest.webp");
});
