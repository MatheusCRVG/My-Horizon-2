import { useState } from "react";
import {
  Pencil,
  Trash2,
  ArrowRight,
  Wallet,
  CreditCard,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import {
  type Field,
  DataForm,
  Modal,
  Toolbar,
  Empty,
  Progress,
  csvExport,
  Stat,
} from "../components/ui";
import { useFinance } from "../core/store";
import {
  reservedValue,
  fundedOccurrences,
  manualPlannedStreams,
  revisedPlan,
  validatePlan,
} from "../core/contributions";
import { resolvePlan } from "../core/plan-resolution";
import { goalMovementRevision } from "../core/merge";
import { targetValue } from "../core/saving-targets";
import { SavingCard, SavingAnalysis } from "./SavingAnalysis";
import { ContributionForm } from "./ContributionForm";
import { PlanEditor } from "./SavingPlanner";
import { HorizonWizard } from "./HorizonWizard";
import { CoverPicker } from "../components/HorizonCover";
import {
  defaultCover,
  horizonCategory,
  horizonCategories,
  isFeatured,
  validateCover,
  type Cover,
} from "../core/horizons";
import {
  rows,
  uid,
  money,
  today,
  dateLabel,
  categories,
  type Kind,
  type Entity,
} from "../core/model";
import {
  accountBalance,
  totals,
  invoice,
  cardOutstanding,
} from "../core/finance";
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  other: Partial<Field> = {},
): Field => ({ key, label, type, required: true, ...other });
const amount = (key: string, label: string, other: Partial<Field> = {}) =>
  f(key, label, "number", { min: 0, ...other });
const opts = (xs: string[]) => xs.map((s) => ({ value: s, label: s }));
export const configs: Partial<
  Record<
    Kind,
    { title: string; subtitle: string; singular: string; fields: Field[] }
  >
> = {
  account: {
    title: "Contas e saldos",
    subtitle: "Uma visão clara de onde seu dinheiro está.",
    singular: "conta",
    fields: [
      f("name", "Nome da conta"),
      f("institution", "Instituição"),
      amount("balance", "Saldo de abertura (R$)", { min: -100000000 }),
      f("date", "Data de abertura", "date", {
        default: today(),
        hint: "Saldo anterior aos lançamentos cadastrados.",
      }),
    ],
  },
  card: {
    title: "Cartões de crédito",
    subtitle: "Suas compras e faturas, sem surpresas.",
    singular: "cartão",
    fields: [
      f("name", "Nome do cartão"),
      f("institution", "Instituição"),
      amount("limit", "Limite de crédito (R$)"),
      amount("closing", "Dia de fechamento", {
        min: 1,
        max: 31,
        step: "1",
        default: 3,
      }),
      amount("due", "Dia de vencimento", {
        min: 1,
        max: 31,
        step: "1",
        default: 10,
      }),
    ],
  },
  goal: {
    title: "Meus horizontes",
    subtitle: "Dê um destino para suas próximas conquistas.",
    singular: "horizonte",
    fields: [
      f("name", "Nome do objetivo"),
      f("notes", "Descrição do horizonte (opcional)", "textarea", {
        required: false,
      }),
      amount("target", "Valor alvo (R$)", { min: 0.01 }),
      amount("saved", "Saldo inicial reservado (R$)", {
        hint: "Valor anterior ao histórico. Use Registrar aporte para os novos valores.",
      }),
      f("deadline", "Data limite (opcional)", "date", {
        default: "",
        required: false,
      }),
      f("priority", "Prioridade", "select", {
        options: [
          { value: "3", label: "Alta" },
          { value: "2", label: "Média" },
          { value: "1", label: "Baixa" },
        ],
        default: "2",
      }),
    ],
  },
  asset: {
    title: "Investimentos e patrimônio",
    subtitle: "Acompanhe o que você constrói ao longo do tempo.",
    singular: "ativo ou dívida",
    fields: [
      f("name", "Descrição"),
      f("type", "Categoria", "select", {
        options: [
          { value: "fixed", label: "Renda fixa" },
          { value: "variable", label: "Renda variável" },
          { value: "other", label: "Outros investimentos" },
          { value: "goods", label: "Bens" },
          { value: "debt", label: "Dívidas e financiamentos" },
        ],
        default: "fixed",
      }),
      amount("amount", "Valor de mercado / saldo devedor (R$)"),
      f("date", "Data de avaliação", "date", { default: today() }),
      f("notes", "Observações", "textarea", { required: false }),
    ],
  },
  budget: {
    title: "Orçamento",
    subtitle: "Limites conscientes para ter liberdade nas suas escolhas.",
    singular: "limite",
    fields: [
      f("category", "Categoria", "select", {
        options: opts(categories),
        default: "Alimentação",
      }),
      amount("limit", "Limite mensal (R$)", { min: 0.01 }),
    ],
  },
  trip: {
    title: "Horizontes de viagem",
    subtitle: "Seu próximo destino começa com um bom plano.",
    singular: "viagem",
    fields: [
      f("name", "Destino"),
      f("country", "País"),
      f("start", "Ida", "date", { default: today() }),
      f("end", "Volta", "date", { default: today() }),
      amount("people", "Pessoas", { min: 1, max: 100, step: "1", default: 1 }),
      f("currency", "Moeda", "text", { default: "BRL" }),
      amount("exchange", "Reais por unidade da moeda", {
        min: 0.0001,
        step: "0.0001",
        default: 1,
      }),
      amount("flights", "Passagens / pessoa (moeda)"),
      amount("hotel", "Hospedagem / noite (moeda)"),
      amount("food", "Alimentação / dia / pessoa (moeda)"),
      amount("transport", "Transporte / dia (moeda)"),
      amount("tours", "Passeios / pessoa (moeda)"),
      amount("insurance", "Seguro / pessoa (moeda)"),
      amount("shopping", "Compras (moeda)"),
      amount("other", "Outros custos (moeda)"),
      amount("margin", "Imprevistos (%)", { max: 100, default: 10 }),
      amount("saved", "Saldo inicial reservado (R$)", {
        hint: "Valor anterior ao histórico. Use Registrar aporte para os novos valores.",
      }),
    ],
  },
  rule: {
    title: "Regras de importação",
    subtitle: "Categorize seus extratos com suas próprias regras.",
    singular: "regra",
    fields: [
      f("keyword", "Descrição contém"),
      f("category", "Categoria", "select", {
        options: opts(categories),
        default: "Outros",
      }),
    ],
  },
};
export function RecordForm({
  kind,
  entity,
  onClose,
  onSaved,
  initialCategory,
}: {
  kind: Kind;
  entity?: Entity;
  onClose: () => void;
  onSaved?: (id: string) => void;
  initialCategory?: string;
}) {
  if (!entity && (kind === "goal" || kind === "trip"))
    return (
      <HorizonWizard
        onClose={onClose}
        onSaved={onSaved}
        initialCategory={
          initialCategory ?? (kind === "trip" ? "travel" : undefined)
        }
      />
    );
  return (
    <ExistingRecordForm
      kind={kind}
      entity={entity}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function ExistingRecordForm({
  kind,
  entity: suppliedEntity,
  onClose,
  onSaved,
}: {
  kind: Kind;
  entity?: Entity;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { doc, edit } = useFinance();
  const [entity] = useState(suppliedEntity);
  const [pending, setPending] = useState<Record<string, any> | null>(null),
    [revision, setRevision] = useState(""),
    [adapt, setAdapt] = useState(true),
    [reviewError, setReviewError] = useState(""),
    [reviewBusy, setReviewBusy] = useState(false);
  const config = configs[kind]!;
  const objective = kind === "goal" || kind === "trip";
  const [photoMode, setPhotoMode] = useState(false);
  const dummy: Entity = entity ?? {
    id: "new",
    kind,
    data: { name: "", saved: 0 },
    vector: {},
    updatedAt: "",
  };
  const [category, setCategory] = useState<string>(horizonCategory(dummy).id),
    [cover, setCover] = useState<Cover | null>(entity?.data.cover ?? null),
    [featured, setFeatured] = useState(entity ? isFeatured(entity) : true),
    [imageBusy, setImageBusy] = useState(false);
  const previewGoal = {
      ...dummy,
      data: { ...dummy.data, horizonCategory: category },
    },
    currentCover = cover ?? defaultCover(previewGoal);
  const persist = async (input: Record<string, any>) => {
    const id = entity?.id ?? uid();
    let data: Entity["data"] = {
      ...entity?.data,
      ...input,
      ...(objective
        ? { horizonCategory: category, cover: currentCover, featured }
        : {}),
      ...(kind === "goal" &&
      entity?.data.plan &&
      input.deadline !== undefined &&
      input.deadline !== entity.data.deadline
        ? { plan: { ...entity.data.plan, deadline: input.deadline } }
        : {}),
    };
    if (pending && entity && kind === "trip") {
      data = {
        ...data,
        tripBudgetHistory: [
          ...(entity.data.tripBudgetHistory ?? []),
          {
            at: new Date().toISOString(),
            fields: Object.fromEntries(
              config.fields
                .filter((f) => f.key !== "saved")
                .map((f) => [f.key, entity.data[f.key]]),
            ),
            scenario: entity.data.scenario,
          },
        ],
      };
      if (adapt && entity.data.plan) {
        const candidate = { ...entity, data };
        const plan = resolvePlan(
          {
            ...entity.data.plan,
            ...(entity.data.plan.mode !== "monthly"
              ? { mode: "date", deadline: input.start }
              : {}),
          },
          targetValue(candidate),
          reservedValue(doc!, candidate),
          today(),
          fundedOccurrences(doc!, entity.id),
          manualPlannedStreams(doc!, entity.id),
        );
        validatePlan(plan);
        data = revisedPlan(candidate, plan);
      }
    }
    await edit([
      {
        id,
        kind,
        ...(objective && entity ? { expectedVector: entity.vector } : {}),
        ...(pending ? { expectedMovements: revision } : {}),
        data,
      },
    ]);
    onSaved?.(id);
    onClose();
  };
  return (
    <Modal
      title={`${entity ? "Editar" : "Adicionar"} ${config.singular}`}
      onClose={onClose}
      className={
        objective
          ? `goal-record-modal ${photoMode ? "photo-mode" : ""}`
          : undefined
      }
    >
      {objective && (
        <div
          className="goal-record-tabs"
          role="group"
          aria-label="Área de edição do horizonte"
        >
          <button
            type="button"
            aria-pressed={!photoMode}
            onClick={() => setPhotoMode(false)}
          >
            Objetivo
          </button>
          <button
            type="button"
            aria-pressed={photoMode}
            onClick={() => setPhotoMode(true)}
          >
            Foto de capa
          </button>
        </div>
      )}
      <DataForm
        scrollable={objective}
        onCancel={objective ? onClose : undefined}
        onInvalid={objective ? () => setPhotoMode(false) : undefined}
        submit={objective ? "Salvar meta" : "Salvar"}
        fields={
          entity?.data.planner
            ? config.fields.filter(
                (f) =>
                  f.key !== "target" &&
                  !(
                    entity.data.planner.type === "travel" &&
                    f.key === "deadline"
                  ),
              )
            : config.fields
        }
        initial={entity?.data}
        submitDisabled={imageBusy}
        extra={
          objective ? (
            <div className="horizon-form-visual">
              <label className="saving-label horizon-form-setting">
                Categoria do horizonte
                <select
                  aria-label="Categoria do horizonte"
                  value={category}
                  disabled={kind === "trip" || !!entity?.data.planner}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {horizonCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="horizon-form-cover">
                <CoverPicker
                  goal={previewGoal}
                  value={currentCover}
                  onChange={setCover}
                  onBusy={setImageBusy}
                />
              </div>
              <label className="checkbox horizon-form-setting">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                />
                Destacar em Seus próximos horizontes
              </label>
              <div className="horizon-form-setting goal-record-explanation">
                {entity?.data.planner && (
                  <p className="info-box">
                    O valor estimado é calculado em Meu Planejamento. Use Editar
                    planejamento na página do horizonte para revisar custos e
                    confirmar uma nova meta.
                  </p>
                )}
                {kind === "goal" && (
                  <p className="muted">
                    Cofrinhos são alocações do dinheiro que já existe. Reservar
                    um valor não cria receitas nem aumenta seu patrimônio.
                  </p>
                )}
              </div>
            </div>
          ) : undefined
        }
        onSubmit={async (data) => {
          if (kind === "trip" && data.end < data.start)
            throw Error("A volta deve ser igual ou posterior à ida.");
          if (objective) validateCover(currentCover);
          if (
            kind === "budget" &&
            rows(doc!, "budget").some(
              (b) => b.id !== entity?.id && b.data.category === data.category,
            )
          )
            throw Error(
              "Já existe um limite para esta categoria. Edite o registro existente.",
            );
          if (
            kind === "trip" &&
            entity &&
            (targetValue({ ...entity, data: { ...entity.data, ...data } }) !==
              targetValue(entity) ||
              data.start !== entity.data.start)
          ) {
            setRevision(goalMovementRevision(doc!, entity.id));
            setPending(data);
            setReviewError("");
          } else await persist(data);
        }}
      />
      {pending && entity && (
        <Modal
          title="Confirmar estimativa da viagem"
          onClose={() => setPending(null)}
        >
          <div className="budget-change-summary">
            <div>
              <span>Meta atual</span>
              <strong>{money(targetValue(entity))}</strong>
            </div>
            <ArrowRight size={22} />
            <div>
              <span>Nova meta estimada</span>
              <strong>
                {money(
                  targetValue({
                    ...entity,
                    data: { ...entity.data, ...pending },
                  }),
                )}
              </strong>
            </div>
          </div>
          <p className="info-box">
            Seu saldo reservado, seus aportes, retiradas e foto serão
            preservados. A estimativa só muda ao confirmar.
          </p>
          {entity.data.plan && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={adapt}
                onChange={(e) => setAdapt(e.target.checked)}
              />
              Recalcular aportes mantendo a estratégia do plano
            </label>
          )}
          {reviewError && (
            <p className="error-box" role="alert">
              {reviewError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="btn"
              disabled={reviewBusy}
              onClick={() => setPending(null)}
            >
              Voltar ao planejamento
            </button>
            <button
              className="btn primary"
              disabled={reviewBusy}
              onClick={async () => {
                setReviewBusy(true);
                setReviewError("");
                try {
                  await persist(pending);
                } catch (e) {
                  setReviewError((e as Error).message);
                } finally {
                  setReviewBusy(false);
                }
              }}
            >
              {reviewBusy ? "Salvando…" : "Confirmar atualização"}
            </button>
          </div>
        </Modal>
      )}
      {kind === "asset" && (
        <p className="muted">
          Cadastre investimentos, bens e dívidas. Saldos das contas são somados
          automaticamente; não os cadastre novamente.
        </p>
      )}
    </Modal>
  );
}
export function DeleteModal({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const { edit, doc } = useFinance();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const related = rows(doc!, "transaction").filter(
    (t) =>
      t.data.accountId === entity.id ||
      t.data.targetAccountId === entity.id ||
      t.data.cardId === entity.id,
  );
  const linkedReserves = rows(doc!, "contribution").filter(
    (c) => c.data.sourceId === entity.id || c.data.transactionId === entity.id,
  );
  related.push(...linkedReserves);
  return (
    <Modal title="Excluir registro?" onClose={onClose}>
      <p>
        Você está excluindo{" "}
        <strong>
          {entity.data.description ??
            entity.data.name ??
            entity.data.category ??
            entity.data.keyword}
        </strong>
        .
      </p>
      {related.length > 0 && (
        <p className="error-box">
          Este registro está vinculado a {related.length} lançamento(s). Remova
          ou altere os vínculos antes de excluir.
        </p>
      )}
      {error && <p className="error-box">{error}</p>}
      <div className="form-actions">
        <button className="btn" onClick={onClose}>
          Voltar
        </button>
        <button
          className="btn danger"
          disabled={busy || related.length > 0}
          onClick={async () => {
            setBusy(true);
            try {
              await edit([
                { ...entity, deleted: true },
                ...rows(doc!, "contribution")
                  .filter((c) => c.data.goalId === entity.id)
                  .map((c) => ({ ...c, deleted: true })),
              ]);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Excluir registro
        </button>
      </div>
    </Modal>
  );
}
export function Records({ kind, month }: { kind: Kind; month: string }) {
  const { doc, edit } = useFinance();
  const config = configs[kind]!;
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Entity | true | null>(null),
    [deleting, setDeleting] = useState<Entity | null>(null),
    [pay, setPay] = useState<Entity | null>(null),
    [deposit, setDeposit] = useState<Entity | null>(null),
    [planning, setPlanning] = useState<Entity | null>(null),
    [analysis, setAnalysis] = useState<Entity | true | null>(null);
  const items = rows(doc!, kind).filter((e) =>
    JSON.stringify(e.data).toLowerCase().includes(search.toLowerCase()),
  );
  const summary = totals(doc!, month);
  const buttons = (e: Entity) => (
    <div className="item-actions">
      <button
        className="icon-btn"
        aria-label={`Editar ${e.data.name ?? e.data.category ?? e.data.keyword}`}
        onClick={() => setEditing(e)}
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon-btn"
        aria-label={`Excluir ${e.data.name ?? e.data.category ?? e.data.keyword}`}
        onClick={() => setDeleting(e)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  if (analysis)
    return (
      <SavingAnalysis
        goal={analysis === true ? undefined : analysis}
        onBack={() => setAnalysis(null)}
      />
    );
  return (
    <>
      <Toolbar
        search={search}
        setSearch={setSearch}
        onAdd={() => setEditing(true)}
        onExport={() =>
          csvExport(
            config.fields.map((f) =>
              f.key === "saved" && (kind === "goal" || kind === "trip")
                ? "Valor já reservado (com aportes)"
                : f.label,
            ),
            items.map((e) =>
              config.fields.map((f) =>
                f.key === "saved" && (kind === "goal" || kind === "trip")
                  ? reservedValue(doc!, e)
                  : e.data[f.key],
              ),
            ),
            `my-horizon-${kind}.csv`,
          )
        }
      >
        {(kind === "goal" || kind === "trip") && (
          <button className="btn" onClick={() => setAnalysis(true)}>
            Análise dos aportes
          </button>
        )}
      </Toolbar>
      {kind === "asset" && (
        <div className="stats-grid three">
          <Stat
            label="Patrimônio líquido"
            value={summary.netWorth}
            detail="Contas + ativos − dívidas − faturas"
          />
          <Stat label="Total investido" value={summary.invested} tone="blue" />
          <Stat label="Dívidas declaradas" value={summary.debts} tone="red" />
        </div>
      )}
      {!items.length ? (
        <div className="panel">
          <Empty
            title={`Seus ${config.title.toLowerCase()} começam aqui`}
            action={() => setEditing(true)}
          />
        </div>
      ) : (
        <div className={`record-grid ${kind === "budget" ? "budgets" : ""}`}>
          {items.map((e) => {
            const d = e.data;
            if (kind === "account")
              return (
                <article className="panel record-card" key={e.id}>
                  <div className="card-top">
                    <span className="tile-icon">
                      <Wallet size={21} />
                    </span>
                    {buttons(e)}
                  </div>
                  <span className="muted">{d.institution}</span>
                  <h3>{d.name}</h3>
                  <strong className="record-value">
                    {money(accountBalance(doc!, e.id))}
                  </strong>
                  <div className="card-bottom">
                    <span>Saldo atual confirmado</span>
                    <ArrowRight size={16} />
                  </div>
                </article>
              );
            if (kind === "goal" || kind === "trip")
              return (
                <SavingCard
                  key={e.id}
                  goal={e}
                  controls={buttons(e)}
                  onPlan={() => setPlanning(e)}
                  onRegister={() => setDeposit(e)}
                  onAnalysis={() => setAnalysis(e)}
                />
              );
            if (kind === "card") {
              const bill = invoice(doc!, e.id, month),
                outstanding = cardOutstanding(doc!, e.id);
              return (
                <article className="panel record-card" key={e.id}>
                  <div className="credit-visual">
                    <div className="split">
                      <span>{d.institution}</span>
                      <CreditCard size={25} />
                    </div>
                    <h3>{d.name}</h3>
                    <span>•••• •••• ••••</span>
                  </div>
                  {buttons(e)}
                  <div className="split">
                    <span>
                      Fatura de {month.split("-").reverse().join("/")}
                    </span>
                    <strong>{money(bill.remaining)}</strong>
                  </div>
                  <Progress
                    value={Number(d.limit) ? (outstanding / d.limit) * 100 : 0}
                  />
                  <div className="split muted">
                    <span>Disponível {money(d.limit - outstanding)}</span>
                    <span>Limite {money(d.limit)}</span>
                  </div>
                  <p className="muted">
                    Fecha dia {d.closing} · Vence dia {d.due}
                  </p>
                  {outstanding > d.limit && (
                    <p className="negative">
                      Limite excedido em {money(outstanding - d.limit)}
                    </p>
                  )}
                  <button
                    className="btn full"
                    disabled={!bill.remaining}
                    onClick={() => setPay(e)}
                  >
                    Pagar fatura
                    <ArrowRight size={16} />
                  </button>
                  <details>
                    <summary>Faturas futuras e pagamentos</summary>
                    {Array.from(
                      new Set(
                        rows(doc!, "transaction")
                          .filter(
                            (t) =>
                              t.data.cardId === e.id &&
                              t.data.payment === "credit",
                          )
                          .map((t) => String(t.data.date).slice(0, 7)),
                      ),
                    )
                      .sort()
                      .map((m) => (
                        <p className="split" key={m}>
                          <span>{m}</span>
                          <span>{money(invoice(doc!, e.id, m).remaining)}</span>
                        </p>
                      ))}
                    {rows(doc!, "transaction")
                      .filter(
                        (t) => t.data.cardId === e.id && t.data.cardPayment,
                      )
                      .map((t) => (
                        <p className="muted" key={t.id}>
                          Pago {dateLabel(t.data.date)} · {money(t.data.amount)}
                        </p>
                      ))}
                  </details>
                </article>
              );
            }
            if (kind === "budget") {
              const spent =
                summary.byCategory.find((c) => c.name === d.category)?.value ??
                0;
              return (
                <article className="panel record-card" key={e.id}>
                  <div className="card-top">
                    <h3>{d.category}</h3>
                    {buttons(e)}
                  </div>
                  <div className="goal-values">
                    <strong>{money(spent)}</strong>
                    <span>de {money(d.limit)}</span>
                  </div>
                  <Progress value={(spent / d.limit) * 100} />
                  <p className={spent > d.limit ? "negative" : "positive"}>
                    {spent > d.limit ? "Limite excedido em " : "Disponível: "}
                    {money(Math.abs(d.limit - spent))}
                  </p>
                </article>
              );
            }
            return (
              <article className="panel record-card" key={e.id}>
                <div className="card-top">
                  <span className="tile-icon">
                    <TrendingUp size={21} />
                  </span>
                  {buttons(e)}
                </div>
                <h3>{d.name ?? d.keyword}</h3>
                {kind === "asset" ? (
                  <>
                    <strong
                      className={`record-value ${d.type === "debt" ? "negative" : ""}`}
                    >
                      {money(d.amount)}
                    </strong>
                    <span className="muted">
                      {
                        configs.asset!.fields[1].options!.find(
                          (o) => o.value === d.type,
                        )?.label
                      }{" "}
                      · {dateLabel(d.date)}
                    </span>
                    <p className="muted">{d.notes}</p>
                  </>
                ) : (
                  <span className="pill">{d.category}</span>
                )}
              </article>
            );
          })}
        </div>
      )}
      {kind === "goal" && items.length > 0 && (
        <div className="panel allocation">
          <div>
            <span className="eyebrow">SEUS COFRINHOS</span>
            <h3>Distribuir um aporte mensal</h3>
            <p className="muted">
              Sugestão proporcional à prioridade de cada meta ainda não
              concluída.
            </p>
          </div>
          <Allocation items={items} />
        </div>
      )}
      {kind === "trip" && items.length > 1 && (
        <div className="panel">
          <h3>Compare seus destinos</h3>
          {items.map((e) => {
            const c = targetValue(e);
            const max = Math.max(...items.map(targetValue), 1);
            return (
              <div className="comparison-row" key={e.id}>
                <span>{e.data.name}</span>
                <Progress value={(c / max) * 100} />
                <strong>{money(c)}</strong>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <RecordForm
          kind={kind}
          entity={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {deleting && (
        <DeleteModal entity={deleting} onClose={() => setDeleting(null)} />
      )}
      {deposit && (
        <ContributionForm goal={deposit} onClose={() => setDeposit(null)} />
      )}
      {planning && (
        <PlanEditor goal={planning} onClose={() => setPlanning(null)} />
      )}
      {pay && (
        <Modal title="Pagar fatura" onClose={() => setPay(null)}>
          <p>
            A fatura de {month} tem saldo de{" "}
            <strong>{money(invoice(doc!, pay.id, month).remaining)}</strong>. O
            pagamento movimenta o caixa; as compras já são despesas.
          </p>
          <DataForm
            fields={[
              f("accountId", "Conta de pagamento", "select", {
                options: rows(doc!, "account").map((a) => ({
                  value: a.id,
                  label: a.data.name,
                })),
              }),
              f("date", "Data do pagamento", "date", { default: today() }),
            ]}
            onSubmit={async (d) => {
              if (d.date > today())
                throw Error(
                  "Para confirmar o pagamento, use uma data até hoje.",
                );
              const remaining = invoice(doc!, pay.id, month).remaining;
              if (!remaining) throw Error("Fatura já paga.");
              await edit([
                {
                  id: `payment:${pay.id}:${month}`,
                  kind: "transaction",
                  data: {
                    description: `Pagamento ${pay.data.name} · ${month}`,
                    amount: remaining,
                    type: "transfer",
                    cardPayment: true,
                    cardId: pay.id,
                    invoiceMonth: month,
                    payment: "pix",
                    status: "confirmed",
                    ...d,
                  },
                },
              ]);
              setPay(null);
            }}
            submit="Confirmar pagamento"
          />
        </Modal>
      )}
      <p className="footnote">
        <AlertCircle size={14} />
        {kind === "trip"
          ? "Cenários econômicos e confortáveis ajustam o custo padrão em −20% e +30%. São estimativas editáveis; viagens não alteram despesas reais."
          : kind === "account"
            ? "O saldo considera a abertura e os lançamentos confirmados até hoje."
            : kind === "goal"
              ? "Valores reservados precisam estar incluídos em suas contas ou investimentos cadastrados."
              : "Os dados são salvos automaticamente no seu cofre."}
      </p>
    </>
  );
}
export function Allocation({ items }: { items: Entity[] }) {
  const [amount, setAmount] = useState(1000);
  const { doc } = useFinance();
  const active = items.filter(
    (e) => !e.data.archived && reservedValue(doc!, e) < targetValue(e),
  );
  const weight = active.reduce((s, e) => s + Number(e.data.priority ?? 2), 0);
  return (
    <div>
      <label className="inline-field">
        Aporte disponível (R$)
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
        />
      </label>
      {active.map((e) => (
        <p className="split" key={e.id}>
          <span>{e.data.name}</span>
          <strong>
            {money(
              Math.min(
                targetValue(e) - reservedValue(doc!, e),
                weight ? (amount * Number(e.data.priority ?? 2)) / weight : 0,
              ),
            )}
          </strong>
        </p>
      ))}
    </div>
  );
}
