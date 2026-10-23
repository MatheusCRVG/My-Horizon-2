const targets = {
  "Visão geral": ["Início", "overview"],
  "Contas e saldos": ["Meu Dinheiro", "account"],
  Lançamentos: ["Meu Dinheiro", "transactions"],
  Calendário: ["Meu Dinheiro", "calendar"],
  "Importar dados": ["Meu Dinheiro", "import"],
  "Meus horizontes": ["Meus Horizontes", "goal"],
  Viagens: ["Meus Horizontes", "trip"],
  Simuladores: ["Meu Futuro", "simulations"],
  "Meu Futuro": ["Meu Futuro", "future"],
};
export async function navigateWorkspace(page, name) {
  if (await page.locator(".mobile-menu").isVisible())
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  if (
    ["Configurações", "Bloquear e sair", "Sair da demonstração"].includes(name)
  ) {
    await page
      .locator(".sidebar")
      .getByRole("button", { name, exact: true })
      .click();
    return;
  }
  const [area, id] = targets[name] ?? [];
  if (!area) throw Error("Destino não configurado no script: " + name);
  await page
    .locator(".workspace-primary-nav")
    .getByRole("button", { name: area, exact: true })
    .click();
  if (id !== "overview")
    await page
      .getByRole("combobox", { name: "Explorar área", exact: true })
      .selectOption(id);
}
