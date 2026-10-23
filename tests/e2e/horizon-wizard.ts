import { expect, type Page } from "@playwright/test";
export async function beginDirectHorizon(
  page: Page,
  category = "Objetivo personalizado",
) {
  const dialog = page.getByRole("dialog", {
    name: "Criar horizonte",
    exact: true,
  });
  await dialog.getByRole("button", { name: category, exact: true }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog.getByRole("button", { name: /^Definir valor/ }).click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  return dialog;
}
export async function finishDirectHorizon(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Criar horizonte",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Definir depois", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
