import { navigateWorkspace } from "./navigate-workspace.mjs";
import { chromium, expect } from "@playwright/test";
if (!process.argv[2])
  throw Error(
    "Informe o caminho de uma planilha para testar a prévia sem importar.",
  );
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios" })
    .click();
  await navigateWorkspace(page, "Importar dados");
  await page.locator("input[type=file]").setInputFiles(process.argv[2]);
  await expect(
    page.getByRole("heading", { name: "Revisar importação" }),
  ).toBeVisible();
  const count = await page.locator("tbody tr").count();
  const errors = await page.locator("[role=alert]").allTextContents();
  if (errors.length) throw Error("Falha na prévia da planilha");
  console.log(
    JSON.stringify({
      workbookPreview: true,
      candidateCount: count,
      confirmedImport: false,
      originalUnmodified: true,
    }),
  );
} finally {
  await browser.close();
}
