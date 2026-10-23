import { useState } from "react";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Trophy,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  Link2,
  Target,
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinance } from "../core/store";
import { dateLabel, money, today, uid, type Entity } from "../core/model";
import {
  annualReflection,
  reflectionLinkChoices,
  reflectionRecords,
  validateReflectionRecord,
} from "../core/reflection";
import { validateCover, type Cover } from "../core/horizons";
import { CoverPicker, HorizonCover } from "../components/HorizonCover";
import { DataForm, Empty, Modal, Stat } from "../components/ui";
import { HorizonDetails } from "./Horizons";
import "../reflection.css";

export function Reflection({ view }: { view: "journal" | "wrapped" }) {
  return view === "journal" ? <FinancialJournal /> : <AnnualWrapped />;
}

function ReflectionForm({
  tab,
  entity,
  onClose,
}: {
  tab: "journal" | "milestone";
  entity?: Entity;
  onClose: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const [linkId, setLinkId] = useState<string>(entity?.data.linkId ?? ""),
    [cover, setCover] = useState<Cover>(
      entity?.data.cover ?? { type: "icon", x: 50, y: 50, zoom: 1 },
    ),
    [imageBusy, setImageBusy] = useState(false);
  const choices = reflectionLinkChoices(doc!);
  const visual: Entity = entity ?? {
    id: "preview",
    kind: "simulation",
    data: { name: "Sua conquista", horizonCategory: "personal" },
    vector: {},
    updatedAt: "",
  };
  const isMilestone = tab === "milestone";
  return (
    <Modal
      title={`${entity ? "Editar" : "Registrar"} ${isMilestone ? "conquista" : "anotação"}`}
      onClose={onClose}
    >
      <p className="muted">
        {isMilestone
          ? "Uma conquista com sua história. A foto fica protegida no mesmo cofre dos seus dados."
          : "Um espaço para lembrar decisões, aprendizados e próximos passos."}{" "}
        Este registro não altera dinheiro ou metas.
      </p>
      <DataForm
        fields={[
          {
            key: "name",
            label: isMilestone ? "Nome da conquista" : "Título da anotação",
            required: true,
          },
          {
            key: "date",
            label: "Data",
            type: "date",
            required: true,
            default: today(),
          },
          {
            key: "description",
            label: "Sua história",
            type: "textarea",
            required: true,
          },
        ]}
        initial={entity?.data}
        submit={
          entity
            ? "Salvar alterações"
            : isMilestone
              ? "Guardar conquista"
              : "Guardar anotação"
        }
        submitDisabled={imageBusy}
        extra={
          <div className="reflection-form-extra">
            <label>
              Associar a um registro (opcional)
              <select
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
              >
                <option value="">Sem vínculo</option>
                {linkId && !choices.some((c) => c.id === linkId) && (
                  <option value={linkId}>
                    {entity?.data.linkLabel || "Registro anterior"} ·
                    indisponível
                  </option>
                )}
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            {isMilestone && (
              <CoverPicker
                goal={visual}
                value={cover}
                onChange={setCover}
                onBusy={setImageBusy}
              />
            )}
          </div>
        }
        onSubmit={async (data) => {
          validateReflectionRecord(data);
          if (isMilestone) validateCover(cover);
          const linked = choices.find((c) => c.id === linkId);
          await edit([
            {
              id: entity?.id ?? uid(),
              kind: "simulation",
              data: {
                ...entity?.data,
                ...data,
                name: data.name.trim(),
                description: data.description.trim(),
                tab,
                linkId,
                linkKind: linked?.kind ?? entity?.data.linkKind ?? "",
                linkLabel: linkId
                  ? (linked?.label ??
                    entity?.data.linkLabel ??
                    "Registro associado")
                  : "",
                ...(isMilestone
                  ? {
                      cover,
                      horizonCategory:
                        entity?.data.horizonCategory ?? "personal",
                    }
                  : {}),
              },
            },
          ]);
          message(
            isMilestone
              ? "Conquista guardada no seu diário."
              : "Anotação salva no seu diário.",
          );
          onClose();
        }}
      />
    </Modal>
  );
}

function FinancialJournal() {
  const { doc, edit, message } = useFinance();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [form, setForm] = useState<{
      tab: "journal" | "milestone";
      entity?: Entity;
    } | null>(null),
    [deleting, setDeleting] = useState<Entity | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const all = [
    ...reflectionRecords(doc!, "journal"),
    ...reflectionRecords(doc!, "milestone"),
  ].sort(
    (a, b) =>
      String(b.data.date).localeCompare(String(a.data.date)) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  const entries = all.filter(
    (e) =>
      (filter === "all" || e.data.tab === filter) &&
      `${e.data.name} ${e.data.description} ${e.data.linkLabel ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.trim().toLocaleLowerCase("pt-BR")),
  );
  const links = reflectionLinkChoices(doc!);
  return (
    <div className="reflection-page">
      <section className="reflection-intro">
        <span className="eyebrow">DIÁRIO FINANCEIRO</span>
        <h2>O que você aprende também conta.</h2>
        <p>
          Guarde suas decisões e celebre o caminho percorrido. Um registro
          pessoal, sem complicar seu planejamento.
        </p>
      </section>
      <div className="reflection-toolbar">
        <label className="reflection-search">
          Buscar no diário
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título, história ou horizonte…"
          />
        </label>
        <label>
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos os registros</option>
            <option value="journal">Anotações</option>
            <option value="milestone">Conquistas</option>
          </select>
        </label>
        <div className="button-row">
          <button className="btn" onClick={() => setForm({ tab: "journal" })}>
            <Plus size={17} />
            Nova anotação
          </button>
          <button
            className="btn primary"
            onClick={() => setForm({ tab: "milestone" })}
          >
            <Trophy size={17} />
            Registrar conquista
          </button>
        </div>
      </div>
      {!entries.length ? (
        <section className="panel">
          <Empty
            title={
              all.length
                ? "Nenhum registro encontrado"
                : "Sua história começa com um registro"
            }
            text={
              all.length
                ? "Tente outra busca ou filtro."
                : "Conte uma decisão importante ou guarde a lembrança de uma conquista."
            }
          />
        </section>
      ) : (
        <section
          className="reflection-entry-grid"
          aria-label="Registros do diário"
        >
          {entries.map((entry) => {
            const milestone = entry.data.tab === "milestone";
            const linked = links.find(
              (choice) => choice.id === entry.data.linkId,
            );
            return (
              <article
                className={`panel reflection-entry ${milestone ? "reflection-milestone" : ""}`}
                key={entry.id}
              >
                {milestone && <HorizonCover goal={entry} />}
                <div className="reflection-entry-content">
                  <div className="reflection-entry-type">
                    <span>
                      {milestone ? (
                        <Trophy size={15} />
                      ) : (
                        <BookOpen size={15} />
                      )}
                      {milestone ? "Conquista pessoal" : "Anotação"}
                    </span>
                    <time dateTime={entry.data.date}>
                      {dateLabel(entry.data.date)}
                    </time>
                  </div>
                  <h3>{entry.data.name}</h3>
                  <p className="reflection-entry-story">
                    {entry.data.description}
                  </p>
                  {entry.data.linkId && (
                    <p className="reflection-link">
                      <Link2 size={14} />
                      <span>
                        {linked?.label ??
                          `${entry.data.linkLabel || "Registro associado"} · indisponível`}
                      </span>
                    </p>
                  )}
                  <div className="reflection-entry-actions">
                    <button
                      className="text-btn"
                      onClick={() =>
                        setForm({
                          tab: milestone ? "milestone" : "journal",
                          entity: entry,
                        })
                      }
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <button
                      className="text-btn"
                      onClick={() => {
                        setError("");
                        setDeleting(entry);
                      }}
                    >
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
      <p className="reflection-private">
        <ShieldNote />
        Anotações e fotografias permanecem no seu cofre criptografado. Não são
        lançamentos financeiros.
      </p>
      {form && (
        <ReflectionForm
          tab={form.tab}
          entity={form.entity}
          onClose={() => setForm(null)}
        />
      )}
      {deleting && (
        <Modal
          title="Excluir este registro do diário?"
          onClose={() => setDeleting(null)}
        >
          <p>
            A anotação ou conquista “{deleting.data.name}” será excluída,
            incluindo sua foto. O objetivo, aporte ou cenário associado será
            preservado.
          </p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <div className="button-row">
            <button className="btn" onClick={() => setDeleting(null)}>
              Manter registro
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await edit([{ ...deleting, deleted: true }]);
                  setDeleting(null);
                  message(
                    "Registro excluído. Seus dados financeiros foram preservados.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Excluindo…" : "Excluir registro"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ShieldNote() {
  return <BookOpen size={15} aria-hidden="true" />;
}

function AnnualWrapped() {
  const { doc } = useFinance();
  const currentYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(currentYear),
    [detail, setDetail] = useState("");
  const years = Array.from(
    new Set([
      currentYear,
      currentYear - 1,
      currentYear - 2,
      ...doc!.entities
        .filter((e) => !e.deleted)
        .flatMap((e) => {
          const date = e.data.date || e.data.at;
          const candidate =
            typeof date === "string" ? Number(date.slice(0, 4)) : NaN;
          return Number.isInteger(candidate) &&
            candidate >= 1900 &&
            candidate <= currentYear
            ? [candidate]
            : [];
        }),
    ]),
  ).sort((a, b) => b - a);
  const review = annualReflection(doc!, year);
  const observations = review.observations;
  const first = observations[0],
    last = observations.at(-1);
  return (
    <div className="reflection-page">
      <section className="reflection-wrapped-hero">
        <div>
          <span className="eyebrow">HORIZON WRAPPED</span>
          <h2>Seu ano em perspectiva.</h2>
          <p>
            Cada passo tem uma história. Veja o que seus registros mostram sobre{" "}
            {year}.
          </p>
          <span className="reflection-cutoff">
            {year === currentYear
              ? `Até ${dateLabel(today())}`
              : `De 01/01/${year} a 31/12/${year}`}{" "}
            · Dados cadastrados no seu cofre
          </span>
        </div>
        <label>
          Ano
          <select
            aria-label="Ano da retrospectiva"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </section>
      {!review.recordCount && (
        <section className="panel">
          <Empty
            title="Este ano ainda não tem movimentações registradas"
            text="A retrospectiva aparece a partir do seu histórico real. Nenhum saldo ou rendimento foi presumido."
          />
        </section>
      )}
      <div className="stats-grid reflection-wrapped-stats">
        <Stat
          label="Receitas registradas"
          value={review.income}
          tone="green"
          detail="Entradas confirmadas, sem transferências"
        />
        <Stat
          label="Despesas registradas"
          value={review.expense}
          detail="Pagamentos de fatura não são nova despesa"
        />
        <Stat
          label="Resultado do ano"
          value={review.saving}
          tone={review.saving >= 0 ? "green" : ""}
          detail="Receitas menos despesas; não altera o saldo"
        />
        <Stat
          label="Aportes líquidos"
          value={review.netDeposits}
          tone="blue"
          detail="Aportes confirmados menos retiradas"
        />
      </div>
      <div className="reflection-wrapped-columns">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>O dinheiro que você organizou</h3>
              <p>Reserva é alocação, não nova receita ou patrimônio.</p>
            </div>
            <Target size={21} />
          </div>
          <div className="reflection-value-row">
            <span>
              <ArrowDownLeft size={17} />
              Aportes realizados
            </span>
            <strong>{money(review.deposits)}</strong>
          </div>
          <div className="reflection-value-row">
            <span>
              <ArrowUpRight size={17} />
              Retiradas registradas
            </span>
            <strong>{money(review.withdrawals)}</strong>
          </div>
          <div className="reflection-value-row reflection-value-total">
            <span>Variação líquida por movimentações</span>
            <strong>{money(review.netDeposits)}</strong>
          </div>
          <p className="muted reflection-small">
            O saldo inicial reservado sem data não é contado como aporte deste
            ano. Rendimentos hipotéticos e aportes planejados ficam fora deste
            resumo.
          </p>
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>Horizontes que chegaram mais perto</h3>
              <p>
                {review.completed.length}{" "}
                {review.completed.length === 1
                  ? "objetivo atingiu"
                  : "objetivos atingiram"}{" "}
                o valor alvo atual neste ano.
              </p>
            </div>
            <Trophy size={21} />
          </div>
          {review.completed.length ? (
            <div className="reflection-achievements">
              {review.completed.map((milestone) => (
                <button
                  className="reflection-achievement"
                  key={milestone.id}
                  onClick={() => setDetail(milestone.goalId!)}
                >
                  <span className="reflection-achievement-icon">
                    <Target size={20} />
                  </span>
                  <span>
                    <strong>{milestone.name}</strong>
                    <small>
                      {dateLabel(milestone.date)} · {money(milestone.amount)}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted reflection-small">
              Nenhuma conclusão pode ser datada pelo histórico preservado deste
              ano. Metas já completas apenas com saldo inicial continuam
              válidas, mas não recebem uma data inventada.
            </p>
          )}
          <p className="muted reflection-small">
            Datas reconstituídas pelos aportes e retiradas, usando o valor alvo
            atual e o saldo inicial declarado. Mudanças antigas do objetivo não
            são reconstruídas. Uma retirada posterior pode mudar o progresso
            atual sem apagar esta passagem pelo valor alvo.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Seu patrimônio, observado</h3>
            <p>
              Somente valores salvos em visitas ao aplicativo; lacunas não são
              preenchidas.
            </p>
          </div>
          <span className="pill">{observations.length} observação(ões)</span>
        </div>
        {observations.length >= 2 && first.timestamp !== last!.timestamp ? (
          <>
            <div className="reflection-observation-summary">
              <div>
                <small>Primeira observação · {dateLabel(first.date)}</small>
                <strong>{money(first.netWorth)}</strong>
              </div>
              <div>
                <small>Última observação · {dateLabel(last!.date)}</small>
                <strong>{money(last!.netWorth)}</strong>
              </div>
              <div>
                <small>Variação entre as observações</small>
                <strong
                  className={
                    review.wealthChange! >= 0 ? "positive" : "negative"
                  }
                >
                  {money(review.wealthChange!)}
                </strong>
              </div>
            </div>
            <div className="chart reflection-wealth-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 15, right: 20, bottom: 12, left: 0 }}
                >
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value: number) =>
                      new Date(value).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "America/Sao_Paulo",
                      })
                    }
                    tick={{ fontSize: 11 }}
                    minTickGap={36}
                  />
                  <YAxis
                    dataKey="netWorth"
                    type="number"
                    tickFormatter={(value: number) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        maximumFractionDigits: 0,
                      }).format(value)
                    }
                    tick={{ fontSize: 11 }}
                    width={62}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload;
                      return active && point ? (
                        <div className="reflection-chart-tooltip">
                          <strong>{dateLabel(point.date)}</strong>
                          <span>
                            Patrimônio observado: {money(point.netWorth)}
                          </span>
                          <span>Saldo em contas: {money(point.balance)}</span>
                        </div>
                      ) : null;
                    }}
                  />
                  <Scatter
                    isAnimationActive={false}
                    data={observations}
                    fill="#0085ff"
                    name="Patrimônio observado"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="muted reflection-small">
              Cada ponto é uma observação salva, e não uma cotação ou
              reconstrução diária. A diferença cobre somente{" "}
              {dateLabel(first.date)} a {dateLabel(last!.date)}; ela não
              equivale necessariamente à variação do ano completo.
            </p>
          </>
        ) : observations.length === 1 ? (
          <div className="reflection-one-observation">
            <strong>{money(first.netWorth)}</strong>
            <p className="muted">
              Patrimônio observado em {dateLabel(first.date)}. Mais observações
              em datas diferentes são necessárias para mostrar evolução.
            </p>
          </div>
        ) : (
          <Empty
            title="Seu histórico patrimonial começa daqui para frente"
            text="Ainda não há observações salvas neste ano. Saldos antigos não serão estimados retroativamente."
          />
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Conquistas que merecem ficar</h3>
            <p>
              Marcos comprováveis pelos aportes e lembranças que você registrou.
            </p>
          </div>
          <Sparkles size={21} />
        </div>
        {!review.automatic.length && !review.manual.length ? (
          <p className="muted reflection-small">
            Ainda não há conquistas datadas neste ano. Você pode guardar uma
            conquista pessoal no Diário financeiro.
          </p>
        ) : (
          <div className="reflection-celebration-grid">
            {review.automatic.map((milestone) => (
              <article
                className="reflection-proven-milestone"
                key={milestone.id}
              >
                <span>
                  <Trophy size={24} />
                </span>
                <small>MARCO DOS REGISTROS</small>
                <h4>{milestone.name}</h4>
                <p>{dateLabel(milestone.date)}</p>
              </article>
            ))}
            {review.manual.map((milestone) => (
              <article
                className="reflection-manual-milestone"
                key={milestone.id}
              >
                <HorizonCover goal={milestone} />
                <div>
                  <small>CONQUISTA PESSOAL</small>
                  <h4>{milestone.data.name}</h4>
                  <time dateTime={milestone.data.date}>
                    {dateLabel(milestone.data.date)}
                  </time>
                  <p>{milestone.data.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="muted reflection-small">
          Marcos automáticos de R$ 1 mil e R$ 10 mil usam apenas aportes
          confirmados acumulados menos retiradas, com datas preservadas.
          Reservas iniciais sem data não são usadas para comprovar esses marcos.
          Conquistas pessoais são declarações do usuário.
        </p>
      </section>
      {detail && (
        <Modal title="Seu horizonte" onClose={() => setDetail("")}>
          <HorizonDetails id={detail} onBack={() => setDetail("")} />
        </Modal>
      )}
    </div>
  );
}
