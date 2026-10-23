import { useState } from "react";
import {
  ShoppingBag,
  Car,
  House,
  TrendingUp,
  Save,
  Trash2,
  FolderOpen,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { DataForm, Stat, type Field, Modal } from "../components/ui";
import { useFinance } from "../core/store";
import { SavingSimulator } from "./SavingSimulator";
import { SavingsBridge } from "./SavingsBridge";
import { rows, money, number, uid, monthNow } from "../core/model";
import {
  purchaseComparison,
  vehicleCost,
  housingCost,
  compound,
  totals,
} from "../core/finance";
const n = (
  key: string,
  label: string,
  value = 0,
  min = 0,
  max = 1000000000,
): Field => ({
  key,
  label,
  type: "number",
  default: value,
  min,
  max,
  required: true,
});
const specs = {
  savings: {
    title: "Aportes e metas",
    icon: Target,
    description: "Planeje e compare o dinheiro que deseja guardar.",
    fields: [] as Field[],
  },
  purchase: {
    title: "Compras",
    icon: ShoppingBag,
    description:
      "Compare as formas de comprar e descubra o que cabe nos seus planos.",
    fields: [
      n("price", "Preço anunciado (R$)", 5000),
      n("discount", "Desconto à vista (%)", 10, 0, 100),
      n("months", "Número de parcelas", 12, 1, 120),
      n("rate", "Juros ao mês (%)", 0, 0, 100),
      n("saved", "Já reservado (R$)", 1000),
      n("monthlySaving", "Quanto pode guardar / mês (R$)", 500),
      n("returnRate", "Rendimento hipotético / mês (%)", 0.7, 0, 100),
      n("freeBudget", "Sobra mensal livre (R$)", 1500),
    ],
  },
  vehicle: {
    title: "Carro ou moto",
    icon: Car,
    description:
      "O preço de compra é só uma parte. Veja o custo de ter um veículo.",
    fields: [
      n("price", "Preço do veículo (R$)", 60000),
      n("down", "Entrada (R$)", 20000),
      n("months", "Parcelas do financiamento", 48, 1, 120),
      n("rate", "Juros ao mês (%)", 1.5, 0, 100),
      n("ipva", "IPVA / ano (R$)", 2400),
      n("insurance", "Seguro / ano (R$)", 3000),
      n("fuel", "Combustível / mês (R$)", 500),
      n("maintenance", "Manutenção / mês (R$)", 150),
      n("parking", "Estacionamento / mês (R$)", 100),
      n("other", "Outros custos / mês (R$)", 0),
      n("depreciation", "Depreciação / ano (%)", 10, 0, 100),
      n("horizon", "Horizonte (meses)", 60, 1, 600),
    ],
  },
  housing: {
    title: "Morar sozinho",
    icon: House,
    description: "Explore o novo capítulo com espaço para imprevistos.",
    fields: [
      n("income", "Renda mensal (R$)", 7000),
      n("current", "Custo mensal atual (R$)", 1500),
      n("rent", "Aluguel / mês (R$)", 1800),
      n("condo", "Condomínio / mês (R$)", 350),
      n("energy", "Energia / mês (R$)", 150),
      n("water", "Água / mês (R$)", 80),
      n("internet", "Internet / mês (R$)", 100),
      n("food", "Alimentação / mês (R$)", 800),
      n("transport", "Transporte / mês (R$)", 300),
      n("unexpected", "Imprevistos / mês (R$)", 200),
      n("furniture", "Mobília (R$)", 8000),
      n("deposit", "Caução (R$)", 5400),
      n("moving", "Mudança (R$)", 1000),
      n("reserveMonths", "Meses de reserva", 6, 1, 36),
    ],
  },
  investment: {
    title: "Juros compostos",
    icon: TrendingUp,
    description: "Visualize o efeito do tempo, dos aportes e da inflação.",
    fields: [
      n("initial", "Valor inicial (R$)", 10000),
      n("contribution", "Aporte mensal (R$)", 500),
      n("annual", "Rentabilidade anual (%)", 8, 0, 100),
      n("inflation", "Inflação anual (%)", 4.5, 0, 100),
      n("months", "Prazo (meses)", 120, 1, 600),
    ],
  },
  emergency: {
    title: "Reserva e liberdade",
    icon: ShieldCheck,
    description:
      "Planeje sua reserva de emergência e uma meta de independência financeira.",
    fields: [
      n("essential", "Despesas essenciais / mês (R$)", 3000),
      n("reserveMonths", "Meses de cobertura", 6, 1, 36),
      n("saved", "Reserva atual (R$)", 10000),
      n("monthly", "Aporte mensal (R$)", 500),
      n("withdrawal", "Retirada anual hipotética (%)", 4, 0.1, 20),
    ],
  },
};
type Tab = keyof typeof specs;
const defaults = (tab: Tab) =>
  Object.fromEntries(specs[tab].fields.map((f) => [f.key, f.default]));
export function Simulations() {
  const { doc, edit, message } = useFinance();
  const [tab, setTab] = useState<Tab>("purchase"),
    [values, setValues] = useState<Record<string, any>>(defaults("purchase")),
    [formKey, setFormKey] = useState(0),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null);
  const spec = specs[tab];
  const saved = rows(doc!, "simulation").filter(
    (e) => e.data.tab !== "savings" && Object.hasOwn(specs, e.data.tab),
  );
  const total = totals(doc!, monthNow());
  const result = () => {
    if (tab === "purchase") {
      const r = purchaseComparison(values);
      return (
        <>
          <div className="stats-grid two">
            <Stat label="À vista com desconto" value={r.cash} tone="blue" />
            <Stat label="Parcela com juros informados" value={r.installment} />
          </div>
          <div className="result-list">
            <div>
              <span>Parcelado sem juros</span>
              <strong>
                {money(values.price / values.months)} × {values.months}
              </strong>
            </div>
            <div>
              <span>Total parcelado com juros</span>
              <strong>{money(r.total)}</strong>
            </div>
            <div>
              <span>Juros pagos</span>
              <strong className="negative">{money(r.interest)}</strong>
            </div>
            <div>
              <span>Valor presente das parcelas</span>
              <strong>{money(r.present)}</strong>
            </div>
            <div>
              <span>Rendimento potencial do valor à vista no prazo</span>
              <strong>{money(r.opportunity)}</strong>
            </div>
            <div>
              <span>Guardar até comprar à vista</span>
              <strong>
                {Number.isFinite(r.months)
                  ? `${r.months} mês(es)`
                  : "Aporte insuficiente"}
              </strong>
            </div>
            <div>
              <span>Parcela / sobra informada</span>
              <strong>{number(r.impact)}%</strong>
            </div>
            <div>
              <span>Aportes equivalentes ao custo total</span>
              <strong>
                {Number.isFinite(r.goalDelay)
                  ? `${r.goalDelay} mês(es)`
                  : "Sem aporte definido"}
              </strong>
            </div>
            <div>
              <span>Sobra após parcela</span>
              <strong>{money(values.freeBudget - r.installment)}</strong>
            </div>
          </div>
          <div className="info-box">
            Adiar a compra preserva {money(r.cash)} hoje. A diferença entre o
            preço à vista e o valor presente das parcelas é{" "}
            {money(Math.abs(r.cash - r.present))} a favor de{" "}
            {r.cash < r.present ? "pagar à vista" : "parcelar"}, nas hipóteses
            informadas.
          </div>
        </>
      );
    }
    if (tab === "vehicle") {
      const r = vehicleCost(values);
      return (
        <>
          <div className="stats-grid two">
            <Stat
              label="Desembolso mensal durante financiamento"
              value={r.monthly}
              tone="blue"
            />
            <Stat label="Total desembolsado no horizonte" value={r.total} />
          </div>
          <div className="result-list">
            <div>
              <span>Parcela do financiamento</span>
              <strong>{money(r.installment)}</strong>
            </div>
            <div>
              <span>Manutenção e uso / mês</span>
              <strong>{money(r.running)}</strong>
            </div>
            <div>
              <span>Desembolso anual durante financiamento</span>
              <strong>{money(r.annual)}</strong>
            </div>
            <div>
              <span>Depreciação no horizonte</span>
              <strong>{money(r.depreciation)}</strong>
            </div>
            <div>
              <span>Custo econômico no horizonte</span>
              <strong>{money(r.economic)}</strong>
            </div>
          </div>
          <p className="muted">
            O custo econômico soma juros, operação e depreciação. O desembolso
            inclui entrada e parcelas pagas dentro do horizonte.
          </p>
          <div className="scenario-mini">
            {[12, 36, 60].map((h) => (
              <div key={h}>
                <span>{h} meses</span>
                <strong>
                  {money(vehicleCost({ ...values, horizon: h }).total)}
                </strong>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (tab === "housing") {
      const r = housingCost(values);
      return (
        <>
          <div className="stats-grid two">
            <Stat label="Custo mensal estimado" value={r.monthly} tone="blue" />
            <Stat label="Reserva recomendada para mudar" value={r.reserve} />
          </div>
          <div className="result-list">
            <div>
              <span>Custos iniciais (inclui caução)</span>
              <strong>{money(r.initial)}</strong>
            </div>
            <div>
              <span>Renda mínima sugerida (30% de folga)</span>
              <strong>{money(r.minimum)}</strong>
            </div>
            <div>
              <span>Sobra mensal</span>
              <strong className={r.left < 0 ? "negative" : "positive"}>
                {money(r.left)}
              </strong>
            </div>
            <div>
              <span>Diferença em relação ao custo atual</span>
              <strong>{money(r.difference)}</strong>
            </div>
          </div>
          <p className="muted">
            Reserva = custos iniciais + {values.reserveMonths} meses de
            despesas. A caução é caixa imobilizado e pode ser recuperável
            conforme o contrato.
          </p>
        </>
      );
    }
    if (tab === "emergency") {
      const target = values.essential * values.reserveMonths,
        missing = Math.max(0, target - values.saved);
      return (
        <>
          <div className="stats-grid two">
            <Stat
              label="Reserva de emergência alvo"
              value={target}
              tone="blue"
            />
            <Stat
              label="Meta de liberdade financeira"
              value={(values.essential * 12) / (values.withdrawal / 100)}
            />
          </div>
          <div className="result-list">
            <div>
              <span>Cobertura atual</span>
              <strong>
                {number(values.essential ? values.saved / values.essential : 0)}{" "}
                meses
              </strong>
            </div>
            <div>
              <span>Falta para a reserva</span>
              <strong>{money(missing)}</strong>
            </div>
            <div>
              <span>Prazo sem rendimento</span>
              <strong>
                {values.monthly
                  ? `${Math.ceil(missing / values.monthly)} meses`
                  : "Informe um aporte"}
              </strong>
            </div>
          </div>
          <p className="muted">
            A taxa de retirada é uma hipótese simplificada, sem garantia de
            sustentabilidade. Não inclui impostos, volatilidade ou custos.
          </p>
        </>
      );
    }
    const data = compound(
      values.initial,
      values.contribution,
      values.annual,
      values.inflation,
      values.months,
    );
    const last = data.at(-1)!;
    const scenarios = [
      { name: "Conservador", rate: Math.max(0, values.annual - 2) },
      { name: "Intermediário", rate: values.annual },
      { name: "Otimista", rate: values.annual + 2 },
    ];
    return (
      <>
        <div className="stats-grid two">
          <Stat
            label="Patrimônio nominal estimado"
            value={last.nominal}
            tone="blue"
          />
          <Stat label="Em poder de compra de hoje" value={last.real} />
        </div>
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.filter(
                (_, i) =>
                  i % Math.max(1, Math.floor(values.months / 60)) === 0 ||
                  i === values.months,
              )}
            >
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${number(v / 1000, 0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Legend />
              <Area
                dataKey="nominal"
                name="Nominal"
                stroke="#2563eb"
                fill="#dbeafe"
              />
              <Area
                dataKey="real"
                name="Corrigido pela inflação"
                stroke="#18aa88"
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="scenario-mini">
          {scenarios.map((s) => (
            <div key={s.name}>
              <span>
                {s.name} · {s.rate}% a.a.
              </span>
              <strong>
                {money(
                  compound(
                    values.initial,
                    values.contribution,
                    s.rate,
                    values.inflation,
                    values.months,
                  ).at(-1)!.nominal,
                )}
              </strong>
            </div>
          ))}
        </div>
        <p className="muted">
          Capitalização mensal equivalente à taxa anual efetiva. Aportes no fim
          do mês. Projeções brutas, sem impostos ou taxas.
        </p>
      </>
    );
  };
  return (
    <>
      <div className="simulation-tabs">
        {Object.entries(specs).map(([key, s]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key as Tab);
              setValues(defaults(key as Tab));
              setFormKey((x) => x + 1);
            }}
          >
            <s.icon size={17} />
            {s.title}
          </button>
        ))}
      </div>
      {tab === "savings" ? (
        <SavingSimulator />
      ) : (
        <>
          <div className="simulation-layout">
            <section className="panel">
              <span className="eyebrow">EXPLORE AS POSSIBILIDADES</span>
              <h3>{spec.title}</h3>
              <p className="muted">{spec.description}</p>
              <DataForm
                key={formKey}
                fields={spec.fields}
                initial={values}
                submit="Calcular cenário"
                onSubmit={async (d) => {
                  if (
                    ("months" in d && !Number.isInteger(d.months)) ||
                    ("horizon" in d && !Number.isInteger(d.horizon))
                  )
                    throw Error("Use prazos em meses inteiros.");
                  if (tab === "vehicle" && d.down > d.price)
                    throw Error("A entrada não pode superar o preço.");
                  setValues(d);
                }}
              />
            </section>
            <section className="panel simulation-result">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">O QUE SEUS NÚMEROS DIZEM</span>
                  <h3>Seu cenário, com clareza</h3>
                </div>
              </div>
              {result()}
              {tab === "purchase" && (
                <SavingsBridge
                  key={`purchase-${JSON.stringify(values)}`}
                  target={purchaseComparison(values).cash}
                  title="Juntar para uma compra"
                  description="Acumule o preço à vista com desconto. As parcelas continuam na comparação acima."
                  initial={Number(values.saved)}
                  monthly={Number(values.monthlySaving)}
                />
              )}
              {tab === "vehicle" && (
                <SavingsBridge
                  key={`vehicle-${JSON.stringify(values)}`}
                  target={Number(values.down)}
                  title="Juntar a entrada do veículo"
                  description="O objetivo é a entrada. Parcelas do financiamento e custos de uso ficam separados."
                />
              )}
              {tab === "housing" && (
                <SavingsBridge
                  key={`housing-${JSON.stringify(values)}`}
                  target={housingCost(values).reserve}
                  title="Juntar para morar sozinho"
                  description={`Custos iniciais de ${money(housingCost(values).initial)} mais a reserva de segurança. O gasto mensal futuro de ${money(housingCost(values).monthly)} não é uma parcela deste plano.`}
                />
              )}
              {tab === "emergency" && (
                <SavingsBridge
                  key={`emergency-${JSON.stringify(values)}`}
                  target={
                    Number(values.essential) * Number(values.reserveMonths)
                  }
                  title="Construir minha reserva"
                  description="Acumule uma reserva. A meta de liberdade financeira permanece como uma hipótese separada."
                  initial={Number(values.saved)}
                  monthly={Number(values.monthly)}
                />
              )}
              <div className="save-scenario">
                <label>
                  Nome do cenário
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: meu próximo passo"
                  />
                </label>
                <button
                  className="btn primary"
                  disabled={saving || !name.trim()}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await edit([
                        {
                          id: uid(),
                          kind: "simulation",
                          data: { name: name.trim(), tab, values },
                        },
                      ]);
                      message("Cenário salvo. Nenhum lançamento foi criado.");
                      setName("");
                    } catch (e) {
                      message((e as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <Save size={16} />
                  Salvar cenário
                </button>
              </div>
              <p className="footnote">
                As taxas e os custos são hipóteses. Simulações não alteram seu
                saldo, despesas ou metas reais.
              </p>
            </section>
          </div>
          <div className="panel">
            <div className="panel-title">
              <div>
                <h3>Cenários salvos</h3>
                <p>Retome seus planos quando quiser</p>
              </div>
              <span className="pill">{saved.length} cenário(s)</span>
            </div>
            {!saved.length ? (
              <p className="muted calm">
                Seus cenários salvos aparecerão aqui.
              </p>
            ) : (
              saved.map((e) => (
                <div className="saved-scenario" key={e.id}>
                  <div>
                    <strong>{e.data.name}</strong>
                    <small>{specs[e.data.tab as Tab]?.title}</small>
                  </div>
                  <button
                    className="btn"
                    onClick={() => {
                      setTab(e.data.tab);
                      setValues(e.data.values);
                      setName(e.data.name);
                      setFormKey((x) => x + 1);
                    }}
                  >
                    <FolderOpen size={15} />
                    Abrir
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Excluir cenário ${e.data.name}`}
                    onClick={() => setDeleting(e.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="info-box">
            Seu contexto atual: economia de {money(total.saving)} no mês,{" "}
            {rows(doc!, "goal").length} meta(s) em andamento e{" "}
            {money(total.committed)} em faturas comprometidas.
          </div>
          {deleting && (
            <Modal title="Excluir cenário?" onClose={() => setDeleting(null)}>
              <p>O cenário será removido dos seus planos salvos.</p>
              <button
                className="btn danger"
                onClick={async () => {
                  const e = saved.find((s) => s.id === deleting);
                  if (e) await edit([{ ...e, deleted: true }]);
                  setDeleting(null);
                }}
              >
                Excluir cenário
              </button>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
