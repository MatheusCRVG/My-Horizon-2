import {
  LayoutDashboard,
  Wallet,
  Target,
  Telescope,
  Sparkles,
  Settings2,
} from "lucide-react";
export const areas = [
  { id: "home", page: "overview", label: "Início", icon: LayoutDashboard },
  { id: "money", page: "account", label: "Meu Dinheiro", icon: Wallet },
  { id: "dreams", page: "goal", label: "Meus Horizontes", icon: Target },
  { id: "future", page: "future", label: "Meu Futuro", icon: Telescope },
  { id: "ai", page: "assistant", label: "Horizon AI", icon: Sparkles },
] as const;
export const areaPages: Record<string, { id: string; label: string }[]> = {
  home: [{ id: "overview", label: "Visão geral" }],
  money: [
    { id: "account", label: "Contas e saldos" },
    { id: "transactions", label: "Lançamentos" },
    { id: "card", label: "Cartões de crédito" },
    { id: "budget", label: "Orçamento" },
    { id: "calendar", label: "Calendário" },
    { id: "connect", label: "Horizon Connect" },
    { id: "inbox", label: "Pendências" },
    { id: "reserve", label: "Reserva de emergência" },
    { id: "recurring", label: "Recorrentes" },
    { id: "import", label: "Importar dados" },
    { id: "rule", label: "Regras de importação" },
  ],
  dreams: [
    { id: "goal", label: "Meus horizontes" },
    { id: "life", label: "Linha do tempo" },
    { id: "map", label: "Mapa dos horizontes" },
    { id: "journal", label: "Diário e conquistas" },
    { id: "trip", label: "Horizontes de viagem" },
  ],
  future: [
    { id: "future", label: "Projeções e cenários" },
    { id: "asset", label: "Investimentos" },
    { id: "savings", label: "Aportes e metas" },
    { id: "reports", label: "Relatórios" },
    { id: "wrapped", label: "Retrospectiva anual" },
    { id: "simulations", label: "Simuladores anteriores" },
  ],
  ai: [
    { id: "assistant", label: "Assistente" },
    { id: "insights", label: "Análises e Horizon Score" },
  ],
};
export const pageArea = (page: string) =>
  Object.entries(areaPages).find(([, pages]) =>
    pages.some((p) => p.id === page),
  )?.[0] ?? "settings";
export function PrimaryNavigation({
  page,
  navigate,
  mobile = false,
}: {
  page: string;
  navigate: (page: string) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      className={mobile ? "workspace-mobile-nav" : "workspace-primary-nav"}
      aria-label={
        mobile ? "Áreas do aplicativo no celular" : "Áreas principais"
      }
    >
      {areas.map((area) => (
        <button
          key={area.id}
          className={`${mobile ? "" : "nav-item "}${pageArea(page) === area.id ? "active" : ""}`}
          aria-current={pageArea(page) === area.id ? "page" : undefined}
          onClick={() => navigate(area.page)}
        >
          <area.icon size={mobile ? 21 : 20} />
          <span>
            {mobile
              ? {
                  home: "Início",
                  money: "Dinheiro",
                  dreams: "Horizontes",
                  future: "Futuro",
                  ai: "AI",
                }[area.id]
              : area.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
export function AreaNavigation({
  page,
  navigate,
}: {
  page: string;
  navigate: (page: string) => void;
}) {
  const area = pageArea(page),
    pages = areaPages[area];
  if (!pages || pages.length < 2) return null;
  return (
    <nav className="workspace-context" aria-label="Navegação da área">
      <div className="workspace-context-links">
        {pages.slice(0, 4).map((p) => (
          <button
            key={p.id}
            aria-current={p.id === page ? "page" : undefined}
            className={p.id === page ? "active" : ""}
            onClick={() => navigate(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label>
        <span>Explorar área</span>
        <select
          aria-label="Explorar área"
          value={page}
          onChange={(e) => navigate(e.target.value)}
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
export function SettingsNavigation({
  page,
  navigate,
}: {
  page: string;
  navigate: (page: string) => void;
}) {
  return (
    <button
      className={`nav-item ${page === "settings" ? "active" : ""}`}
      onClick={() => navigate("settings")}
    >
      <Settings2 size={19} />
      <span>Configurações</span>
    </button>
  );
}
