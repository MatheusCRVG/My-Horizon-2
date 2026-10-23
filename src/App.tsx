import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { reservationIntegrity } from "./core/reservations";
import {
  ArrowLeftRight,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  RefreshCw,
  Cloud,
  Menu,
  X,
  ShieldCheck,
  Download,
  WifiOff,
  Search,
  Plus,
  Sparkles,
  CircleHelp,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  PrimaryNavigation,
  AreaNavigation,
  SettingsNavigation,
} from "./components/WorkspaceNavigation";
import { Intelligence, usePulseSession } from "./features/Intelligence";
import { MobileNavigation52 } from "./components/MobileNavigation52";
const Future = lazy(() =>
  import("./features/Future").then((m) => ({ default: m.Future })),
);
const MoneyPlanning = lazy(() =>
  import("./features/MoneyPlanning").then((m) => ({
    default: m.MoneyPlanning,
  })),
);
const ConnectInbox = lazy(() =>
  import("./features/ConnectInbox").then((m) => ({ default: m.ConnectInbox })),
);
const Simulations = lazy(() =>
  import("./features/Simulations").then((m) => ({ default: m.Simulations })),
);
const ImportPage = lazy(() =>
  import("./features/Import").then((m) => ({ default: m.ImportPage })),
);
const HorizonLife = lazy(() =>
  import("./features/HorizonLife").then((m) => ({ default: m.HorizonLife })),
);
const Reflection = lazy(() =>
  import("./features/Reflection").then((m) => ({ default: m.Reflection })),
);
const SavingSimulator = lazy(() =>
  import("./features/SavingSimulator").then((m) => ({
    default: m.SavingSimulator,
  })),
);
import { QuickGuide } from "./features/QuickGuide";
import { Brand } from "./components/Brand";
import { BRAND } from "./core/brand";
import { Modal } from "./components/ui";
import { HorizonsPage, HorizonDetails } from "./features/Horizons";
import { GlobalSearch } from "./features/GlobalSearch";
import { RecoveryModal } from "./features/Auth";
import { IndependentAuth as Auth } from "./features/IndependentAuth";
import { Dashboard, Reports } from "./features/Dashboard";
import { Records, RecordForm, configs } from "./features/Records";
import { Transactions, TransactionForm } from "./features/Transactions";

import { Settings } from "./features/Settings";
import { useFinance } from "./core/store";
import {
  categories,
  monthNow,
  rows,
  type Kind,
  type Entity,
} from "./core/model";
import * as accountAuth from "./services/auth/client";
const meta: Record<string, [string, string]> = {
  overview: ["Visão geral", "Seu dinheiro em perspectiva."],
  transactions: ["Lançamentos", "Cada movimento conta para o seu futuro."],
  recurring: [
    "Recorrentes",
    "Previsões mensais para planejar com tranquilidade.",
  ],
  simulations: ["Simuladores", "Explore possibilidades antes de decidir."],
  reports: [
    "Relatórios e projeções",
    "Transforme seus registros em boas decisões.",
  ],
  import: ["Importar dados", "Seus registros, conectados ao seu novo espaço."],
  settings: ["Configurações", "Seu espaço, do seu jeito."],
  future: [
    "Meu Futuro",
    "Hipóteses transparentes. Possibilidades em perspectiva.",
  ],
  calendar: [
    "Calendário financeiro",
    "Antecipe seus compromissos e cuide do que vem pela frente.",
  ],
  reserve: [
    "Sua reserva de emergência",
    "Um pouco mais de tranquilidade para o seu futuro.",
  ],
  connect: ["Horizon Connect", "Seus dados financeiros, com sua autorização."],
  inbox: ["Sua caixa de pendências", "Revise o que precisa da sua atenção."],
  assistant: [
    "Horizon AI",
    "Seu dinheiro, explicado com os dados que você tem.",
  ],
  insights: [
    "Análises e Horizon Score",
    "Padrões verificáveis para decisões mais claras.",
  ],
  life: ["Sua linha do tempo", "Cada conquista tem um lugar na sua história."],
  map: ["Mapa dos horizontes", "Prioridades e caminhos, em uma visão."],
  journal: [
    "Diário e conquistas",
    "O que você aprendeu. O que você conquistou.",
  ],
  wrapped: [
    "Sua retrospectiva",
    "O ano que você construiu, um passo de cada vez.",
  ],
  savings: [
    "Aportes e metas",
    "Compare estratégias para o seu próximo horizonte.",
  ],
};
export function App() {
  const s = useFinance();
  const reservationError = useMemo(
    () => (s.doc ? reservationIntegrity(s.doc) : ""),
    [s.doc],
  );
  const pulseBaseline = usePulseSession();
  const [page, setPage] = useState("overview"),
    [month, setMonth] = useState(monthNow()),
    [account, setAccount] = useState(""),
    [category, setCategory] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("f5-theme") === "dark"),
    [menu, setMenu] = useState(false),
    [newTx, setNewTx] = useState(false),
    [newTxType, setNewTxType] = useState<"income" | "expense">("expense"),
    [guideOpen, setGuideOpen] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<any>(null),
    [searchOpen, setSearchOpen] = useState(false),
    [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const unlocked = !!s.doc;
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    void accountAuth
      .listenAuthUrls((message) => useFinance.getState().message(message))
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      })
      .catch((e) => useFinance.getState().message((e as Error).message));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    if (!unlocked) {
      setPage("overview");
      setAccount("");
      setCategory("");
      setMenu(false);
      setNewTx(false);
      setSearchOpen(false);
      setSelectedEntity(null);
      setGuideOpen(false);
      setPrivacy(false);
    }
  }, [unlocked]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (unlocked && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [unlocked]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("f5-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const connected = () => {
        setOnline(true);
        void useFinance.getState().sync();
      },
      offline = () => setOnline(false),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstall(e);
      };
    window.addEventListener("online", connected);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  useEffect(() => {
    if (!unlocked || s.demo) return;
    let last = Date.now();
    const activity = () => {
        last = Date.now();
      },
      update = () => {
        last = Date.now();
      };
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((e) =>
      window.addEventListener(e, activity, { passive: true }),
    );
    window.addEventListener("f5-lock-setting", update);
    const timer = setInterval(() => {
      if (
        Date.now() - last >
        Number(localStorage.getItem("f5-lock-minutes") || 10) * 60000
      )
        useFinance.getState().lock();
    }, 1000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
      window.removeEventListener("f5-lock-setting", update);
    };
  }, [unlocked, s.demo]);
  useEffect(() => {
    if (!unlocked || s.demo) return;
    const timer = setInterval(() => {
      const st = useFinance.getState();
      if (navigator.onLine && !st.syncing) void st.sync();
    }, 15000);
    return () => clearInterval(timer);
  }, [unlocked, s.demo]);
  useEffect(() => {
    if (!s.pending || !s.doc || s.demo) return;
    const timer = setTimeout(() => {
      if (navigator.onLine) void useFinance.getState().sync();
    }, 1500);
    return () => clearTimeout(timer);
  }, [s.doc, s.pending, s.demo]);
  useEffect(() => {
    if (!s.notice) return;
    const timer = setTimeout(() => useFinance.getState().message(""), 5000);
    return () => clearTimeout(timer);
  }, [s.notice]);
  if (!s.doc) return <Auth />;
  const navigate = (p: string) => {
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const beginTransaction = (type: "income" | "expense" = "expense") => {
    setNewTxType(type);
    setNewTx(true);
  };
  const title = meta[page]?.[0] ?? configs[page as Kind]?.title ?? page;
  const subtitle = meta[page]?.[1] ?? configs[page as Kind]?.subtitle;
  const nav = <PrimaryNavigation page={page} navigate={navigate} />;
  return (
    <div
      className={`app-shell workspace-shell ${privacy ? "privacy-active" : ""}`}
    >
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand onClick={() => navigate("overview")} />
        <button
          className="mobile-close icon-btn"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        >
          <X size={22} />
        </button>
        <div className="workspace-label">
          <span className="avatar small">EU</span>
          <div>
            <strong>Meu espaço pessoal</strong>
            <small>{s.demo ? "Demonstração" : "Cofre privado"}</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <button
          className="sidebar-search"
          onClick={() => {
            setMenu(false);
            setSearchOpen(true);
          }}
        >
          <Search size={16} />
          <span>Buscar no {BRAND.name}</span>
          <kbd>Ctrl K</kbd>
        </button>
        {nav}
        <div className="sidebar-bottom">
          <SettingsNavigation page={page} navigate={navigate} />
          <div className="safe-note">
            <Sparkles size={18} />
            <div>
              <strong>
                {s.demo ? "Seu planejamento." : "Seu planejamento."}
              </strong>
              <small>{s.demo ? "No seu ritmo." : "No seu ritmo."}</small>
            </div>
          </div>
          <button
            className="nav-item"
            onClick={() => {
              s.lock();
              setPage("overview");
              setAccount("");
              setCategory("");
            }}
          >
            <LogOut size={17} />
            {s.demo ? "Sair da demonstração" : "Bloquear e sair"}
          </button>
        </div>
      </aside>
      {menu && (
        <div className="sidebar-backdrop" onClick={() => setMenu(false)} />
      )}
      <div className="app-main">
        <header className="topbar">
          <button
            className="topbar-search"
            aria-label="Abrir busca global"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={17} />
            <span>Buscar lançamentos, categorias ou contas…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="mobile52-topbar-logo" aria-hidden="true">
              <img src={BRAND.symbol} alt="" />
            </span>
            <span>Meu espaço</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-btn mobile52-search-trigger"
              aria-label="Buscar no My Horizon+"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <button
              className="guide-button"
              onClick={() => setGuideOpen(true)}
              aria-label="Como usar o My Horizon+"
            >
              <CircleHelp size={18} />
              <span>Como usar</span>
            </button>
            <span className={`sync-label ${s.pending ? "pending" : ""}`}>
              {!online ? <WifiOff size={14} /> : <Cloud size={14} />}
              <span>
                {s.demo
                  ? "Demonstração"
                  : !online
                    ? "Offline — Alterações salvas neste dispositivo"
                    : !s.cloudLinked
                      ? "Somente neste dispositivo"
                      : s.syncing
                        ? "Sincronizando — Atualizando informações"
                        : s.pending || s.error
                          ? "Atenção — Existem alterações pendentes"
                          : s.lastSync
                            ? "Online — Sincronizado"
                            : "Salvo neste dispositivo"}
              </span>
            </span>
            <button
              className="icon-btn"
              aria-label={
                privacy
                  ? "Mostrar conteúdo financeiro"
                  : "Ocultar conteúdo financeiro"
              }
              aria-pressed={privacy}
              onClick={() => setPrivacy(!privacy)}
            >
              {privacy ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
            <button
              className="icon-btn"
              aria-label="Alternar tema"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="avatar"
              aria-label="Abrir configurações"
              onClick={() => navigate("settings")}
            >
              EU
            </button>
          </div>
        </header>
        {s.demo && (
          <div className="demo-banner">
            <span>
              <ShieldCheck size={15} />
              Você está explorando dados fictícios. Alterações são temporárias.
            </span>
            <button onClick={s.lock}>
              Entrar no meu cofre
              <ArrowLeftRight size={14} />
            </button>
          </div>
        )}
        {privacy && (
          <div className="privacy-notice" role="status">
            Conteúdo financeiro oculto nesta tela.
            <button className="text-btn" onClick={() => setPrivacy(false)}>
              Mostrar conteúdo
            </button>
          </div>
        )}
        <main
          className={`page-${page}`}
          inert={privacy}
          aria-hidden={privacy || undefined}
        >
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                MEU ESPAÇO <span className="heading-slash">/</span>{" "}
                {title.toLocaleUpperCase("pt-BR")}
              </span>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="heading-actions">
              <span className="heading-date">
                {new Date().toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {install && (
                <button
                  className="btn"
                  onClick={async () => {
                    await install.prompt();
                    setInstall(null);
                  }}
                >
                  <Download size={16} />
                  Instalar app
                </button>
              )}
              <button
                className="btn"
                aria-label="Sincronizar"
                disabled={s.syncing || s.demo}
                onClick={() => void s.sync(true)}
              >
                <RefreshCw size={15} className={s.syncing ? "spin" : ""} />
                <span>Sincronizar</span>
              </button>
              {page === "overview" && (
                <button
                  className="btn primary"
                  aria-label="Novo lançamento"
                  onClick={() => beginTransaction()}
                >
                  <Plus size={16} />
                  <span>Novo lançamento</span>
                </button>
              )}
            </div>
          </div>
          <AreaNavigation page={page} navigate={navigate} />
          {[
            "overview",
            "transactions",
            "recurring",
            "card",
            "asset",
            "budget",
            "reports",
          ].includes(page) && (
            <div className="global-filters">
              <label>
                <span>Período</span>
                <input
                  aria-label="Período"
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setMonth(e.target.value);
                  }}
                />
              </label>
              {["overview", "reports"].includes(page) && (
                <>
                  <label>
                    <span>Conta</span>
                    <select
                      aria-label="Filtrar conta"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                    >
                      <option value="">Todas as contas</option>
                      {rows(s.doc, "account").map((a) => (
                        <option value={a.id} key={a.id}>
                          {a.data.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Categoria</span>
                    <select
                      aria-label="Filtrar categoria"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">Todas as categorias</option>
                      {Array.from(
                        new Set([
                          ...categories,
                          ...rows(s.doc, "transaction")
                            .map((t) => t.data.category)
                            .filter(Boolean),
                        ]),
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <span className="period-tag">BRL · Real brasileiro</span>
            </div>
          )}
          {reservationError && (
            <div className="error-box" role="alert">
              <strong>Algumas reservas precisam de revisão.</strong>
              <p>
                {reservationError} O histórico foi preservado. Confira os
                aportes e vínculos antes de usar estes valores para novas
                decisões.
              </p>
              <button className="btn" onClick={() => navigate("goal")}>
                Revisar meus horizontes
              </button>
            </div>
          )}
          {s.conflicts > 0 && (
            <div className="error-box split">
              <span>
                {s.conflicts} edição(ões) concorrente(s) precisam de revisão.
                Indicadores usam valores locais provisórios.
              </span>
              <button className="btn" onClick={() => navigate("settings")}>
                Revisar conflitos
              </button>
            </div>
          )}
          {s.error && page !== "settings" && (
            <div className="error-box split" role="alert">
              <span>{s.error}</span>
              <button className="text-btn" onClick={() => navigate("settings")}>
                Abrir configurações
              </button>
            </div>
          )}
          <Suspense
            fallback={
              <div className="panel workspace-loading" role="status">
                Preparando seu espaço…
              </div>
            }
          >
            {page === "overview" ? (
              <Dashboard
                month={month}
                account={account}
                category={category}
                navigate={navigate}
                add={beginTransaction}
                pulseBaseline={pulseBaseline}
                setMonth={setMonth}
              />
            ) : page === "transactions" || page === "recurring" ? (
              <Transactions
                key={page}
                initialMode={page === "recurring" ? "recurring" : "all"}
                month={month}
                account={account}
                category={category}
                setAccount={setAccount}
                setCategory={setCategory}
              />
            ) : page === "simulations" ? (
              <Simulations />
            ) : page === "future" ? (
              <Future navigate={navigate} />
            ) : page === "calendar" || page === "reserve" ? (
              <MoneyPlanning key={page} view={page} navigate={navigate} />
            ) : page === "connect" || page === "inbox" ? (
              <ConnectInbox
                key={page}
                view={page}
                navigate={navigate}
                onEdit={setSelectedEntity}
              />
            ) : page === "assistant" || page === "insights" ? (
              <Intelligence key={page} view={page} navigate={navigate} />
            ) : page === "life" || page === "map" ? (
              <HorizonLife view={page} navigate={navigate} />
            ) : page === "journal" || page === "wrapped" ? (
              <Reflection view={page} />
            ) : page === "savings" ? (
              <SavingSimulator />
            ) : page === "goal" || page === "trip" ? (
              <HorizonsPage
                key={page}
                travelOnly={page === "trip"}
                navigate={navigate}
              />
            ) : page === "reports" ? (
              <Reports month={month} account={account} category={category} />
            ) : page === "import" ? (
              <ImportPage />
            ) : page === "settings" ? (
              <Settings />
            ) : configs[page as Kind] ? (
              <Records key={page} kind={page as Kind} month={month} />
            ) : null}
          </Suspense>
          <footer className="main-footer">
            <span>
              <strong>{BRAND.name}</strong>
            </span>
            <span>
              {s.cloudLinked && s.lastSync
                ? `Sincronizado ${new Date(s.lastSync).toLocaleString("pt-BR")}`
                : BRAND.tagline}
            </span>
          </footer>
        </main>
      </div>
      <MobileNavigation52
        page={page}
        navigate={navigate}
        add={beginTransaction}
        search={() => setSearchOpen(true)}
      />
      {newTx && (
        <TransactionForm
          initialType={newTxType}
          onClose={() => setNewTx(false)}
        />
      )}
      {guideOpen && (
        <QuickGuide
          onClose={() => setGuideOpen(false)}
          navigate={(p) => {
            setGuideOpen(false);
            navigate(p);
          }}
          add={(type) => {
            setGuideOpen(false);
            beginTransaction(type);
          }}
        />
      )}
      {searchOpen && (
        <GlobalSearch
          onClose={() => setSearchOpen(false)}
          onPick={(entity) => {
            setSearchOpen(false);
            setSelectedEntity(entity);
          }}
          onCategory={(name) => {
            setSearchOpen(false);
            setCategory(name);
            navigate("transactions");
          }}
        />
      )}
      {selectedEntity &&
        (selectedEntity.kind === "transaction" ? (
          <TransactionForm
            entity={selectedEntity}
            onClose={() => setSelectedEntity(null)}
          />
        ) : selectedEntity.kind === "goal" || selectedEntity.kind === "trip" ? (
          <Modal title="Seu horizonte" onClose={() => setSelectedEntity(null)}>
            <HorizonDetails
              id={selectedEntity.id}
              onBack={() => setSelectedEntity(null)}
            />
          </Modal>
        ) : (
          <RecordForm
            kind={selectedEntity.kind}
            entity={selectedEntity}
            onClose={() => setSelectedEntity(null)}
          />
        ))}
      {s.notice && (
        <div className="toast" role="status">
          <ShieldCheck size={17} />
          {s.notice}
        </div>
      )}
      {s.recoverySecret && (
        <RecoveryModal
          recovery={s.recoverySecret}
          done={() => {
            s.acknowledgeRecovery();
            void s.sync();
          }}
        />
      )}
    </div>
  );
}
