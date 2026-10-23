import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  GitBranch,
  Info,
  ListFilter,
  Map,
  Search,
  Settings2,
  Target,
} from "lucide-react";
import { HorizonCover } from "../components/HorizonCover";
import { Modal } from "../components/ui";
import { useFinance } from "../core/store";
import { dateLabel, money, today, type Entity } from "../core/model";
import { horizonCategories, horizonCategory } from "../core/horizons";
import {
  dependencyIds,
  lifePlan,
  projectPriorityBudget,
  validateDependencies,
  type LifeNode,
} from "../core/life";
import { HorizonDetails } from "./Horizons";
import "../life.css";

const priorities = [
  { value: 3, label: "Principal" },
  { value: 2, label: "Alta" },
  { value: 1, label: "Normal" },
  { value: 0, label: "Baixa" },
];

function SequenceEditor({
  goal,
  budget,
  months,
  onClose,
}: {
  goal: Entity;
  budget: number;
  months: number;
  onClose: () => void;
}) {
  const { doc, edit } = useFinance();
  const [priority, setPriority] = useState(Number(goal.data.priority) || 0);
  const [dependencies, setDependencies] = useState(dependencyIds(goal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const existing = useMemo(() => lifePlan(doc!), [doc]);
  const preview = useMemo(() => {
    try {
      validateDependencies(doc!, goal.id, dependencies);
      const candidate = {
        ...doc!,
        entities: doc!.entities.map((g) =>
          g.id === goal.id
            ? { ...g, data: { ...g.data, priority, dependsOn: dependencies } }
            : g,
        ),
      };
      return { nodes: lifePlan(candidate), error: "" };
    } catch (e) {
      return { nodes: [] as LifeNode[], error: (e as Error).message };
    }
  }, [doc, goal.id, priority, dependencies]);
  const impacts = preview.nodes.filter((n) => {
    const before = existing.find((p) => p.id === n.id);
    return (
      before &&
      (before.completion !== n.completion || before.blocked !== n.blocked)
    );
  });
  const budgetImpacts = useMemo(() => {
    if (preview.error) return [];
    try {
      const before = projectPriorityBudget(existing, budget, today(), months);
      return projectPriorityBudget(preview.nodes, budget, today(), months)
        .filter(
          (n) => before.find((p) => p.id === n.id)?.completion !== n.completion,
        )
        .map((n) => ({
          ...n,
          name: preview.nodes.find((p) => p.id === n.id)?.name || "Horizonte",
        }));
    } catch {
      return [];
    }
  }, [existing, preview, budget, months]);
  return (
    <Modal title={`Organizar ${goal.data.name}`} onClose={onClose}>
      <p className="life-note">
        Prioridades e pré-requisitos organizam a sua visão de futuro. Seus
        aportes e prazos cadastrados continuam preservados.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            validateDependencies(doc!, goal.id, dependencies);
            setSaving(true);
            const current = doc!.entities.find(
              (e) => e.id === goal.id && !e.deleted,
            );
            if (!current)
              throw Error("Este horizonte não está mais disponível.");
            await edit([
              {
                ...current,
                data: { ...current.data, priority, dependsOn: dependencies },
              },
            ]);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="life-field">
          <span>Prioridade deste horizonte</span>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {priorities.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="life-dependency-picker">
          <legend>Começar depois de concluir</legend>
          <p className="life-note">
            Opcional. Você ainda pode adicionar dinheiro manualmente em qualquer
            ordem.
          </p>
          {existing
            .filter(
              (n) =>
                n.id !== goal.id &&
                (!n.goal.data.archived ||
                  n.completed ||
                  dependencies.includes(n.id)),
            )
            .map((node) => (
              <label key={node.id}>
                <input
                  type="checkbox"
                  checked={dependencies.includes(node.id)}
                  onChange={(e) =>
                    setDependencies((ids) =>
                      e.target.checked
                        ? [...ids, node.id]
                        : ids.filter((id) => id !== node.id),
                    )
                  }
                />
                <span>
                  <strong>{node.name}</strong>
                  <small>
                    {node.completed
                      ? "Já concluído"
                      : node.goal.data.archived
                        ? "Arquivado sem concluir"
                        : "Em andamento"}
                  </small>
                </span>
              </label>
            ))}
          {dependencies
            .filter((id) => !existing.some((n) => n.id === id))
            .map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    setDependencies((ids) => ids.filter((item) => item !== id))
                  }
                />
                <span>
                  <strong>Pré-requisito indisponível</strong>
                  <small>Desmarque para remover o vínculo antigo.</small>
                </span>
              </label>
            ))}
          {existing.length <= 1 && !dependencies.length && (
            <p className="life-note">
              Outros horizontes aparecerão aqui quando você os cadastrar.
            </p>
          )}
        </fieldset>
        {(preview.error || error) && (
          <p className="life-error" role="alert">
            {error || preview.error}
          </p>
        )}
        {!preview.error && (
          <div className="life-preview">
            <strong>Hipótese com seus planos atuais</strong>
            {impacts.length ? (
              impacts.map((n) => (
                <p key={n.id}>
                  <b>{n.name}</b>
                  <span>
                    {n.completion
                      ? `Estimativa: ${dateLabel(n.completion)}`
                      : n.reason || "Sem previsão na nova sequência"}
                  </span>
                </p>
              ))
            ) : (
              <p>
                As datas estimadas dos planos atuais permanecem iguais. A
                prioridade também será usada na distribuição hipotética do
                orçamento.
              </p>
            )}
          </div>
        )}
        {!preview.error && (
          <div className="life-preview">
            <strong>Hipótese de orçamento por prioridade</strong>
            <p>
              {money(budget)} por mês, durante {months} meses.
            </p>
            {budgetImpacts.length ? (
              budgetImpacts.slice(0, 8).map((n) => (
                <p key={n.id}>
                  <b>{n.name}</b>
                  <span>
                    {n.completion
                      ? `Nova estimativa: ${dateLabel(n.completion)}`
                      : "Sem conclusão no período da hipótese"}
                  </span>
                </p>
              ))
            ) : (
              <p>
                As datas desta hipótese permanecem iguais. Sem orçamento, não há
                previsão nova.
              </p>
            )}
            {budgetImpacts.length > 8 && (
              <p>
                Mais {budgetImpacts.length - 8} horizontes também têm efeitos
                nesta hipótese.
              </p>
            )}
          </div>
        )}
        <button
          className="btn primary life-save"
          type="submit"
          disabled={saving || !!preview.error}
        >
          {saving ? "Salvando…" : "Salvar sequência e prioridade"}
        </button>
      </form>
    </Modal>
  );
}

export function HorizonLife({
  view,
  navigate,
}: {
  view: "life" | "map";
  navigate: (page: string) => void;
}) {
  const { doc } = useFinance();
  const nodes = useMemo(() => lifePlan(doc!), [doc]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [organize, setOrganize] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [budget, setBudget] = useState(() =>
    nodes
      .filter((n) => !n.completed && !n.goal.data.archived)
      .reduce((sum, n) => sum + n.monthlyPlanned, 0),
  );
  const [months, setMonths] = useState(120);
  const projection = useMemo(() => {
    try {
      return {
        nodes: projectPriorityBudget(nodes, budget, today(), months),
        error: "",
      };
    } catch (e) {
      return { nodes: [], error: (e as Error).message };
    }
  }, [nodes, budget, months]);
  const filtered = nodes.filter((node) => {
    if (
      status === "archived" ? !node.goal.data.archived : node.goal.data.archived
    )
      return false;
    if (
      (status === "active" && node.completed) ||
      (status === "completed" && !node.completed)
    )
      return false;
    if (category && horizonCategory(node.goal).id !== category) return false;
    return node.name
      .toLocaleLowerCase("pt-BR")
      .includes(search.trim().toLocaleLowerCase("pt-BR"));
  });
  const projected = (node: LifeNode) =>
    shared
      ? projection.nodes.find((p) => p.id === node.id)?.completion || ""
      : node.completion;
  const ordered = [...filtered].sort((a, b) => {
    if (view === "map")
      return (
        a.depth - b.depth ||
        b.priority - a.priority ||
        a.name.localeCompare(b.name, "pt-BR")
      );
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    const da = a.completed ? a.completedDate : projected(a),
      db = b.completed ? b.completedDate : projected(b);
    return (
      (da || "9999").localeCompare(db || "9999") ||
      b.priority - a.priority ||
      a.name.localeCompare(b.name, "pt-BR")
    );
  });
  const completed = filtered.filter((n) => n.completed).length;
  const organizingGoal = nodes.find((n) => n.id === organize)?.goal;

  return (
    <div className="life-root">
      <section className="life-intro">
        <div>
          <span className="eyebrow">
            {view === "map" ? "HORIZON MAP" : "HORIZON LIFE"}
          </span>
          <h2>
            {view === "map"
              ? "Seus horizontes, conectados."
              : "Sua vida. Seus próximos capítulos."}
          </h2>
          <p>
            Uma única visão das conquistas que você está construindo, a partir
            dos horizontes que já existem.
          </p>
        </div>
        <button className="btn" onClick={() => navigate("goal")}>
          Meus horizontes <ArrowUpRight size={16} />
        </button>
      </section>
      <div
        className="life-view-switch"
        aria-label="Visualização dos horizontes"
      >
        <button
          className={view === "life" ? "active" : ""}
          aria-pressed={view === "life"}
          onClick={() => navigate("life")}
        >
          <CalendarDays size={17} /> Linha do tempo
        </button>
        <button
          className={view === "map" ? "active" : ""}
          aria-pressed={view === "map"}
          onClick={() => navigate("map")}
        >
          <Map size={17} /> Mapa de horizontes
        </button>
      </div>
      <section className="panel life-planning">
        <div className="life-panel-heading">
          <div>
            <h3>Escolha como olhar para o futuro</h3>
            <p>
              Os dois modos são estimativas. Nenhum altera seus aportes reais.
            </p>
          </div>
          <Info size={20} />
        </div>
        <div
          className="life-mode-switch"
          aria-label="Premissas de planejamento"
        >
          <button
            className={!shared ? "active" : ""}
            aria-pressed={!shared}
            onClick={() => setShared(false)}
          >
            Hipótese com planos atuais
          </button>
          <button
            className={shared ? "active" : ""}
            aria-pressed={shared}
            onClick={() => setShared(true)}
          >
            Hipótese de orçamento por prioridade
          </button>
        </div>
        {shared ? (
          <>
            <div className="life-budget-inputs">
              <label className="life-field">
                <span>Orçamento mensal compartilhado (R$)</span>
                <input
                  type="number"
                  min={0}
                  max={1e12}
                  step="0.01"
                  value={Number.isFinite(budget) ? budget : ""}
                  onChange={(e) =>
                    setBudget(
                      e.target.value === "" ? NaN : Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="life-field">
                <span>Período da simulação</span>
                <select
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  {[12, 36, 60, 120, 240, 600].map((m) => (
                    <option key={m} value={m}>
                      {m / 12} {m === 12 ? "ano" : "anos"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="life-note">
              O valor inicial vem da soma dos aportes mensais configurados. A
              hipótese distribui este único orçamento em ordem de prioridade,
              até concluir cada objetivo, e libera dependentes no mês seguinte.
              Não usa o saldo inicial livre, não presume rendimento e não
              substitui seus planos. Empates usam prazo desejado e depois
              identificador. Alterar a prioridade muda a distribuição para todos
              os horizontes, inclusive os ocultos pelos filtros.
            </p>
            {projection.error && (
              <p className="life-error" role="alert">
                {projection.error}
              </p>
            )}
            {budget === 0 && (
              <p className="life-note">
                Com orçamento zero não há novas previsões de conclusão.
              </p>
            )}
          </>
        ) : (
          <p className="life-note">
            Usa as previsões do planejador de aportes. Quando um pré-requisito
            tem data estimada válida, o horizonte dependente começa no dia
            seguinte e sua conclusão é deslocada pela mesma quantidade de dias,
            mantendo a duração do plano. Sem uma previsão do pré-requisito, não
            inventamos uma data. A prioridade organiza a lista; os planos
            individuais continuam independentes. O Início e os detalhes dos
            horizontes mostram a previsão original desses planos, sem este
            deslocamento hipotético.
          </p>
        )}
      </section>
      <div className="life-toolbar">
        <label className="life-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar um horizonte…"
            aria-label="Buscar na linha do tempo e no mapa"
          />
        </label>
        <label>
          <span className="life-sr-only">Situação dos horizontes</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Ativos e concluídos</option>
            <option value="active">Em andamento</option>
            <option value="completed">Concluídos</option>
            <option value="archived">Arquivados</option>
          </select>
        </label>
        <label>
          <span className="life-sr-only">Categoria dos horizontes</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {horizonCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section
        className="life-stats"
        aria-label="Resumo dos horizontes filtrados"
      >
        <div>
          <span>
            {status === "archived" ? "Arquivados sem concluir" : "Em andamento"}
          </span>
          <strong>{filtered.length - completed}</strong>
        </div>
        <div>
          <span>Conquistas</span>
          <strong>{completed}</strong>
        </div>
        <div>
          <span>Acumulado nos horizontes exibidos</span>
          <strong>
            {money(filtered.reduce((sum, n) => sum + n.saved, 0))}
          </strong>
        </div>
        <div>
          <span>Falta para os objetivos exibidos</span>
          <strong>
            {money(filtered.reduce((sum, n) => sum + n.remaining, 0))}
          </strong>
        </div>
      </section>
      {!ordered.length ? (
        <section className="panel life-empty">
          <Target size={38} />
          <h3>
            {nodes.length
              ? "Nenhum horizonte com esses filtros"
              : "Cada conquista começa com um horizonte."}
          </h3>
          <p>
            {nodes.length
              ? "Ajuste a busca ou a situação para encontrar seus objetivos."
              : "Crie seu objetivo, escolha uma foto e comece a construir seus próximos capítulos."}
          </p>
          <button className="btn primary" onClick={() => navigate("goal")}>
            Abrir meus horizontes <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <div className={view === "map" ? "life-map-grid" : "life-timeline"}>
          {ordered.map((node) => {
            const forecast = projected(node),
              projectionNode = projection.nodes.find((p) => p.id === node.id);
            const blocked = shared ? projectionNode?.blocked : node.blocked;
            const statusLabel = node.goal.data.archived
              ? "Arquivado"
              : node.completed
                ? "Concluído"
                : blocked
                  ? "Revisar sequência"
                  : forecast
                    ? "Em andamento"
                    : "Sem estimativa";
            return (
              <article
                className={`life-card ${node.completed ? "completed" : ""}`}
                key={node.id}
                data-life-id={node.id}
              >
                <div className="life-card-date">
                  <span className="life-time-dot">
                    {node.completed ? (
                      <Check size={15} />
                    ) : (
                      <Target size={15} />
                    )}
                  </span>
                  <strong>
                    {node.completed
                      ? node.completedDate
                        ? dateLabel(node.completedDate)
                        : "Conquista registrada"
                      : forecast
                        ? dateLabel(forecast)
                        : "No seu tempo"}
                  </strong>
                  <small>
                    {node.completed
                      ? node.completedDate
                        ? "Primeiro alcance registrado"
                        : "Data não registrada"
                      : forecast
                        ? shared
                          ? "Hipótese de orçamento"
                          : "Hipótese com planos atuais"
                        : "Sem previsão de conclusão"}
                  </small>
                </div>
                <div className="life-card-body">
                  <button
                    className="life-cover-button"
                    aria-label={`Abrir horizonte ${node.name}`}
                    onClick={() => setDetail(node.id)}
                  >
                    <HorizonCover goal={node.goal} />
                  </button>
                  <div className="life-card-info">
                    {view === "map" && (
                      <span className="life-stage">
                        <GitBranch size={13} />
                        {node.dependsOn.length
                          ? `Etapa ${node.depth + 1} · tem pré-requisitos`
                          : "Etapa 1 · independente"}
                      </span>
                    )}
                    <div className="life-card-top">
                      <span>{horizonCategory(node.goal).label}</span>
                      <span
                        className={`life-status ${node.completed ? "done" : ""}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <button
                      className="life-name"
                      onClick={() => setDetail(node.id)}
                    >
                      <h3>{node.name}</h3>
                      <ArrowUpRight size={17} />
                    </button>
                    <div className="life-money">
                      <strong>{money(node.saved)}</strong>
                      <span>de {money(node.target)}</span>
                      <b>{Math.round(node.percent)}%</b>
                    </div>
                    <div
                      className="life-progress"
                      role="progressbar"
                      aria-label={`Progresso de ${node.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.max(0, node.percent))}
                    >
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, node.percent))}%`,
                        }}
                      />
                    </div>
                    <div className="life-card-facts">
                      <span>
                        {node.remaining
                          ? `Faltam ${money(node.remaining)}`
                          : node.saved > node.target
                            ? `${money(node.saved - node.target)} além do objetivo`
                            : "Objetivo alcançado"}
                      </span>
                      <span>
                        Prioridade:{" "}
                        {priorities.find((p) => p.value === node.priority)
                          ?.label || node.priority}
                      </span>
                      {node.desired && (
                        <span>
                          Prazo desejado: {dateLabel(node.desired)}
                          {!node.completed && node.desired < today()
                            ? " · já passou"
                            : ""}
                        </span>
                      )}
                      {node.monthlyPlanned > 0 && (
                        <span>
                          Aporte do plano: {money(node.monthlyPlanned)}/mês
                        </span>
                      )}
                    </div>
                    {!!node.dependsOn.length && (
                      <div className="life-dependencies">
                        <GitBranch size={15} />
                        <span>Depois de </span>
                        {node.dependsOn.map((id) => {
                          const dep = nodes.find((n) => n.id === id);
                          return dep ? (
                            <button key={id} onClick={() => setDetail(id)}>
                              {dep.name}
                              {dep.completed && <Check size={12} />}
                            </button>
                          ) : (
                            <span className="life-error" key={id}>
                              horizonte indisponível
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {!node.completed && (
                      <p className="life-estimate-note">
                        {blocked
                          ? shared
                            ? "Há um pré-requisito indisponível, arquivado sem concluir ou em ciclo. Revise a sequência."
                            : node.reason
                          : !forecast
                            ? shared
                              ? "O orçamento e o período desta hipótese ainda não concluem este horizonte."
                              : node.reason ||
                                "Configure seu plano para estimar uma data."
                            : !shared && node.delayDays > 0
                              ? `A sequência desloca a estimativa em ${node.delayDays} dias. Sem a dependência: ${dateLabel(node.baseCompletion)}.`
                              : "Estimativa sem rendimentos garantidos. Seus aportes reais continuam independentes."}
                      </p>
                    )}
                    <div className="life-card-actions">
                      <button
                        className="btn"
                        onClick={() => setDetail(node.id)}
                      >
                        Ver horizonte <ArrowUpRight size={15} />
                      </button>
                      <button
                        className="text-btn"
                        onClick={() => setOrganize(node.id)}
                      >
                        <Settings2 size={15} /> Organizar
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="life-integrity-note">
        <ListFilter size={17} />
        <p>
          Fotos, valores e aportes vêm dos mesmos horizontes do dashboard.
          Dependências são uma ferramenta de planejamento e não bloqueiam
          aportes manuais. As estimativas não reservam dinheiro nem alteram
          metas reais.
        </p>
      </div>
      {detail && (
        <Modal title="Seu horizonte" onClose={() => setDetail(null)}>
          <HorizonDetails id={detail} onBack={() => setDetail(null)} />
        </Modal>
      )}
      {organizingGoal && (
        <SequenceEditor
          goal={organizingGoal}
          budget={budget}
          months={months}
          onClose={() => setOrganize(null)}
        />
      )}
    </div>
  );
}
