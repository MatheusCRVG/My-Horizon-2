import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  House,
  Menu,
  Plus,
  Search,
  Target,
  Wallet,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { areaPages } from "./WorkspaceNavigation";

type MobileTab = "home" | "money" | "horizons" | "analytics" | "more";
type QuickType = "income" | "expense";

const moneyPages = new Set(areaPages.money.map(({ id }) => id));
const horizonPages = new Set(areaPages.dreams.map(({ id }) => id));
const analyticsPages = new Set([
  ...areaPages.future.map(({ id }) => id),
  "insights",
]);

export function activeMobileTab(page: string): MobileTab {
  if (page === "overview") return "home";
  if (moneyPages.has(page)) return "money";
  if (horizonPages.has(page)) return "horizons";
  if (analyticsPages.has(page)) return "analytics";
  return "more";
}

const tabs = [
  { id: "home", page: "overview", label: "Início", icon: House },
  { id: "money", page: "transactions", label: "Finanças", icon: Wallet },
  { id: "horizons", page: "goal", label: "Horizontes", icon: Target },
  { id: "analytics", page: "reports", label: "Análises", icon: BarChart3 },
  { id: "more", page: "", label: "Mais", icon: Menu },
] as const;

const sections = [
  { title: "Meu dinheiro", items: areaPages.money },
  { title: "Meus horizontes", items: areaPages.dreams },
  { title: "Planejar e analisar", items: areaPages.future },
  { title: "Inteligência", items: areaPages.ai },
];

/**
 * A single navigation source for touch screens. Does not change the document,
 * authentication, encryption or persistence models.
 */
export function MobileNavigation52({
  page,
  navigate,
  add,
  search,
}: {
  page: string;
  navigate: (page: string) => void;
  add: (type: QuickType) => void;
  search: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const tab = activeMobileTab(page);

  useEffect(() => {
    if (!moreOpen && !quickOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        setQuickOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen, quickOpen]);

  function openPage(next: string) {
    setMoreOpen(false);
    setQuickOpen(false);
    navigate(next);
  }

  function createTransaction(type: QuickType) {
    setMoreOpen(false);
    setQuickOpen(false);
    add(type);
  }

  return (
    <>
      <button
        type="button"
        className="mobile52-quick-trigger"
        aria-label="Adicionar lançamento financeiro"
        aria-expanded={quickOpen}
        onClick={() => {
          setMoreOpen(false);
          setQuickOpen((open) => !open);
        }}
      >
        <Plus size={24} aria-hidden="true" />
        <span>Novo</span>
      </button>

      <nav className="mobile52-dock" aria-label="Navegação principal">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            className={tab === item.id || (item.id === "more" && moreOpen) ? "active" : ""}
            aria-current={item.id !== "more" && tab === item.id ? "page" : undefined}
            aria-expanded={item.id === "more" ? moreOpen : undefined}
            onClick={() => {
              setQuickOpen(false);
              if (item.id === "more") setMoreOpen((open) => !open);
              else openPage(item.page);
            }}
          >
            <item.icon size={21} strokeWidth={tab === item.id ? 2.4 : 1.9} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {(moreOpen || quickOpen) && (
        <div
          className="mobile52-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setMoreOpen(false);
              setQuickOpen(false);
            }
          }}
        >
          <section
            className="mobile52-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile52-sheet-title"
          >
            <div className="mobile52-sheet-header">
              <div>
                <span className="mobile52-sheet-eyebrow">MY HORIZON+</span>
                <h2 id="mobile52-sheet-title">
                  {moreOpen ? "Explorar meu espaço" : "Novo lançamento"}
                </h2>
              </div>
              <button
                ref={closeButton}
                type="button"
                className="mobile52-close"
                aria-label="Fechar"
                onClick={() => {
                  setMoreOpen(false);
                  setQuickOpen(false);
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {moreOpen ? (
              <>
                <button
                  type="button"
                  className="mobile52-search"
                  onClick={() => {
                    setMoreOpen(false);
                    search();
                  }}
                >
                  <Search size={19} aria-hidden="true" />
                  Buscar contas, metas ou lançamentos
                </button>
                {sections.map((section) => (
                  <div className="mobile52-section" key={section.title}>
                    <h3>{section.title}</h3>
                    {section.items.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        aria-current={page === item.id ? "page" : undefined}
                        onClick={() => openPage(item.id)}
                      >
                        <span>{item.label}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ))}
                <div className="mobile52-section">
                  <h3>Meu aplicativo</h3>
                  <button type="button" onClick={() => openPage("settings")}>
                    <span>Configurações e segurança</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <div className="mobile52-quick-options">
                <p>Escolha como deseja registrar sua movimentação.</p>
                <button type="button" onClick={() => createTransaction("income")}>
                  <span className="mobile52-action-icon income"><ArrowDownLeft size={22} /></span>
                  <span><strong>Adicionar receita</strong><small>Dinheiro que entrou</small></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => createTransaction("expense")}>
                  <span className="mobile52-action-icon expense"><ArrowUpRight size={22} /></span>
                  <span><strong>Adicionar despesa</strong><small>Registrar um gasto</small></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
