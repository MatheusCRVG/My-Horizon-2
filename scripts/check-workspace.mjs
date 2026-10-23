import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [360, 768, 1440, 2542]) {
    const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5173");
    await page
      .getByRole("button", { name: "Explorar com dados fictícios" })
      .click();
    async function check(id) {
      await expect(page.locator(`main.page-${id}`)).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator("main")
            .evaluate((el) => !!el.querySelector(".workspace-loading")),
        )
        .toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await page.locator("body").innerText()).not.toMatch(
        /Horizon One|Financeiro 5\.0/,
      );
      await page.evaluate(() => scrollTo(0, 0));
      results.push({ width, page: id, overflow: false });
      if (
        [360, 1440].includes(width) &&
        [
          "overview",
          "future",
          "calendar",
          "assistant",
          "life",
          "inbox",
          "journal",
          "wrapped",
        ].includes(id)
      )
        await page.screenshot({
          path: `artifacts/workspace-${id}-${width}.png`,
          fullPage: width === 1440,
        });
    }
    await check("overview");
    for (const [area, pages] of [
      [
        "Meu Dinheiro",
        [
          "account",
          "transactions",
          "budget",
          "calendar",
          "reserve",
          "connect",
          "inbox",
        ],
      ],
      ["Meus Horizontes", ["goal", "life", "map", "journal"]],
      [
        "Meu Futuro",
        ["future", "asset", "savings", "reports", "wrapped", "simulations"],
      ],
      ["Horizon AI", ["assistant", "insights"]],
    ]) {
      if (await page.locator(".mobile-menu").isVisible())
        await page
          .getByRole("button", { name: "Abrir menu", exact: true })
          .click();
      await page
        .locator(".workspace-primary-nav")
        .getByRole("button", { name: area, exact: true })
        .click();
      for (const id of pages) {
        await page
          .getByRole("combobox", { name: "Explorar área", exact: true })
          .selectOption(id);
        await check(id);
      }
    }
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(JSON.stringify({ results, pageErrors: 0, oldVisibleNames: 0 }));
} finally {
  await browser.close();
}
