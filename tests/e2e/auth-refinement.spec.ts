import { mockCloud } from "./cloud-fixture";
import { expect, test } from "@playwright/test";

test("authentication is balanced and readable on phone, tablet and large desktops", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [width, height] of [
    [360, 800],
    [768, 1024],
    [1440, 1000],
    [2542, 1247],
  ]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          name: "Seu próximo horizonte começa aqui.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Continuar com Google", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Explorar com dados fictícios",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.locator(".mini-bars, .auth-benefits")).toHaveCount(0);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
      const login = await page
        .getByRole("button", { name: "Continuar com Google", exact: true })
        .boundingBox();
      expect(login!.height).toBeGreaterThanOrEqual(52);
      expect(login!.x).toBeGreaterThanOrEqual(18);
      expect(login!.x + login!.width).toBeLessThanOrEqual(width - 18);
      if (width > 900) {
        await expect(page.locator(".auth-product-preview")).toBeVisible();
        await expect(
          page.locator(".auth-product-preview figcaption"),
        ).toContainText("dados fictícios");
        await page
          .locator(".auth-product-preview img")
          .evaluate(async (image: HTMLImageElement) => {
            await image.decode();
          });
        const form = await page.locator(".auth-form").boundingBox();
        expect(form!.width).toBeGreaterThanOrEqual(400);
        expect(form!.width).toBeLessThanOrEqual(440);
      } else
        await expect(page.locator(".auth-product-preview")).not.toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`login-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    });
  }
  expect(errors).toEqual([]);
});

test("Google entry uses the independent PKCE account and keeps Drive separate", async ({ page, context }) => {
  await mockCloud(context);
  let authorization = "";
  page.on("request", (request) => { if (request.url().includes("/auth/v1/authorize")) authorization = request.url(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Continuar com Google", exact: true }).click();
  await expect(page.getByLabel("Senha-mestra", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Confirme a senha", { exact: false })).toBeVisible();
  const url = new URL(authorization);
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  expect(authorization).not.toContain("drive.file");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByText("Configurar conexão e migração", { exact: true }).click();
  await page.getByRole("button", { name: "Conectar servidor do My Horizon+", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Conectar seu servidor", exact: true })).toBeVisible();
});

test("demonstration remains available without Google authorization", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios", exact: true })
    .click();
  await expect(page.locator(".demo-banner")).toContainText("dados fictícios");
  await expect(page.locator(".next-horizons")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
});
