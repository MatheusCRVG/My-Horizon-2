import { expect, type Page } from "@playwright/test";
const pages: Record<string, [string, string]> = {
  "Visão geral": ["Início", "overview"],
  "Contas e saldos": ["Meu Dinheiro", "account"],
  Lançamentos: ["Meu Dinheiro", "transactions"],
  "Cartões de crédito": ["Meu Dinheiro", "card"],
  Orçamento: ["Meu Dinheiro", "budget"],
  Recorrentes: ["Meu Dinheiro", "recurring"],
  Calendário: ["Meu Dinheiro", "calendar"],
  "Horizon Connect": ["Meu Dinheiro", "connect"],
  Pendências: ["Meu Dinheiro", "inbox"],
  "Reserva de emergência": ["Meu Dinheiro", "reserve"],
  "Importar dados": ["Meu Dinheiro", "import"],
  "Regras de importação": ["Meu Dinheiro", "rule"],
  "Meus horizontes": ["Meus Horizontes", "goal"],
  Viagens: ["Meus Horizontes", "trip"],
  "Linha do tempo": ["Meus Horizontes", "life"],
  "Mapa dos horizontes": ["Meus Horizontes", "map"],
  "Diário e conquistas": ["Meus Horizontes", "journal"],
  "Meu Futuro": ["Meu Futuro", "future"],
  Investimentos: ["Meu Futuro", "asset"],
  Simuladores: ["Meu Futuro", "simulations"],
  Relatórios: ["Meu Futuro", "reports"],
  "Aportes e metas": ["Meu Futuro", "savings"],
  "Retrospectiva anual": ["Meu Futuro", "wrapped"],
  "Horizon AI": ["Horizon AI", "assistant"],
  "Análises e Horizon Score": ["Horizon AI", "insights"],
};
export async function navigateApp(page: Page, label: string) {
  await expect(page.locator(".topbar")).toBeVisible();
  if (await page.locator(".mobile-menu").isVisible())
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  if (
    ["Bloquear e sair", "Sair da demonstração", "Configurações"].includes(label)
  ) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name: label, exact: true })
      .click();
    return;
  }
  const [area, id] = pages[label] ?? [];
  if (!area) throw Error(`Destino de teste desconhecido: ${label}`);
  await page
    .locator(".workspace-primary-nav")
    .getByRole("button", { name: area, exact: true })
    .click();
  if (area !== "Início")
    await page
      .getByRole("combobox", { name: "Explorar área", exact: true })
      .selectOption(id);
  await expect(page.locator(`main.page-${id}`)).toBeVisible();
}
