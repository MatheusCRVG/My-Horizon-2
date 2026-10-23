import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Sparkles,
  Send,
  ShieldCheck,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { useFinance } from "../core/store";
import { money, number, rows, today, type Entity } from "../core/model";
import {
  assistantAnswer,
  budgetAnalysis,
  horizonScore,
  pulseChanges,
  pulseSnapshot,
  spendingSignals,
  type PulseSnapshot,
} from "../core/intelligence";
import {
  dashboardLayout,
  dashboardSections,
  workspaceChange,
} from "../core/workspace";
import { Modal, Progress } from "../components/ui";

export function usePulseSession() {
  const { doc, owner, device, edit, message } = useFinance();
  const [baseline, setBaseline] = useState<PulseSnapshot | null>(null),
    session = useRef(""),
    pending = useRef("");
  const snapshot = useMemo(() => (doc ? pulseSnapshot(doc) : null), [doc]);
  const fingerprint = snapshot
    ? JSON.stringify({ ...snapshot, at: undefined })
    : "";
  useEffect(() => {
    if (!doc || !snapshot) {
      session.current = "";
      pending.current = "";
      setBaseline(null);
      return;
    }
    const id = `my-horizon:pulse:${device}`;
    const existing = rows(doc, "simulation").find((e) => e.id === id);
    const sessionStart = session.current !== owner;
    if (sessionStart) {
      session.current = owner;
      const previous = existing?.data.snapshot;
      setBaseline(
        previous &&
          Array.isArray(previous.transactionIds) &&
          previous.goals &&
          Number.isFinite(previous.balance)
          ? previous
          : null,
      );
    }
    const previousKey = existing?.data.fingerprint;
    if (
      !sessionStart &&
      (previousKey === fingerprint || pending.current === fingerprint)
    )
      return;
    pending.current = fingerprint;
    const wealthId = `my-horizon:wealth:${today()}:${device}`;
    const wealth = rows(doc, "simulation").find((e) => e.id === wealthId);
    const changes: Pick<Entity, "id" | "kind" | "data">[] = [
      {
        id,
        kind: "simulation",
        data: {
          tab: "pulse-state",
          name: "Última visita neste dispositivo",
          snapshot,
          fingerprint,
        },
      },
    ];
    if (
      !wealth ||
      wealth.data.netWorth !== snapshot.netWorth ||
      wealth.data.balance !== snapshot.balance
    ) {
      changes.push({
        id: wealthId,
        kind: "simulation",
        data: {
          tab: "wealth-snapshot",
          name: "Observação patrimonial",
          at: snapshot.at,
          balance: snapshot.balance,
          netWorth: snapshot.netWorth,
        },
      });
    }
    void edit(changes).catch((err) => {
      pending.current = "";
      message((err as Error).message);
    });
  }, [doc, owner, device, snapshot, fingerprint, edit, message]);
  return baseline;
}
export function DashboardCustomizer() {
  const { doc, edit, message } = useFinance(),
    [open, setOpen] = useState(false),
    [order, setOrder] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          const current = dashboardLayout(doc!);
          setOrder([
            ...current,
            ...dashboardSections
              .map((s) => s.id)
              .filter((id) => !current.includes(id)),
          ]);
          setSelected(current);
          setOpen(true);
        }}
      >
        <SlidersHorizontal size={16} />
        Personalizar início
      </button>
      {open && (
        <Modal title="Seu início, do seu jeito" onClose={() => setOpen(false)}>
          <p className="muted">
            O resumo do seu dinheiro fica sempre visível. Escolha e organize os
            outros blocos.
          </p>
          <div className="horizon-order-list">
            {order.map((id, i) => (
              <div key={id}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, id]
                          : selected.filter((v) => v !== id),
                      )
                    }
                  />
                  {dashboardSections.find((s) => s.id === id)?.label}
                </label>
                <div className="button-row">
                  {[-1, 1].map((direction) => (
                    <button
                      key={direction}
                      className="icon-btn"
                      disabled={
                        i + direction < 0 || i + direction >= order.length
                      }
                      aria-label={`Mover ${id} para ${direction < 0 ? "cima" : "baixo"}`}
                      onClick={() => {
                        const next = [...order];
                        [next[i], next[i + direction]] = [
                          next[i + direction],
                          next[i],
                        ];
                        setOrder(next);
                      }}
                    >
                      {direction < 0 ? (
                        <ArrowUp size={17} />
                      ) : (
                        <ArrowDown size={17} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await edit([
                    workspaceChange(useFinance.getState().doc!, {
                      dashboard: order.filter((id) => selected.includes(id)),
                    }),
                  ]);
                  setOpen(false);
                  message("Seu início foi personalizado.");
                } catch (err) {
                  message((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              Salvar organização
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function HorizonPulse({
  baseline,
  navigate,
}: {
  baseline: PulseSnapshot | null;
  navigate: (p: string) => void;
}) {
  const { doc } = useFinance(),
    changes = pulseChanges(doc!, baseline);
  return (
    <section className="panel horizon-pulse">
      <div className="panel-title">
        <div>
          <span className="eyebrow">HORIZON PULSE</span>
          <h3>O que mudou por aqui</h3>
        </div>
        <Activity size={21} />
      </div>
      <p className="muted">
        {baseline
          ? `Desde a última visita neste dispositivo, em ${new Date(baseline.at).toLocaleString("pt-BR")}.`
          : "Sua primeira visita cria uma referência para as próximas novidades."}
      </p>
      {changes.length ? (
        <div className="pulse-grid">
          {changes.slice(0, 6).map((event) => (
            <button key={event.id} onClick={() => navigate(event.page)}>
              <span>
                <strong>{event.title}</strong>
                <small>{event.text}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      ) : (
        <p className="pulse-empty">
          {baseline
            ? "Seus registros continuam em dia com a última visita. Confira os próximos compromissos no calendário."
            : "Movimentações, saldos e avanços reais aparecerão aqui quando houver mudanças."}
        </p>
      )}
      <button className="text-btn" onClick={() => navigate("calendar")}>
        Ver próximos compromissos <ArrowRight size={15} />
      </button>
    </section>
  );
}
export function ScoreCard({
  navigate,
  full = false,
}: {
  navigate: (p: string) => void;
  full?: boolean;
}) {
  const { doc } = useFinance(),
    result = horizonScore(doc!);
  return (
    <section className="panel score-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">HORIZON SCORE</span>
          <h3>Uma perspectiva da sua saúde financeira</h3>
        </div>
        <ShieldCheck size={21} />
      </div>
      <div className="score-value">
        <strong>{result.score ?? "—"}</strong>
        <span>
          {result.score === null
            ? result.reason
            : "de 100 · indicador educativo"}
        </span>
      </div>
      {result.score !== null && <Progress value={result.score} />}
      <p className="muted">
        Cobertura: {result.coverage}% dos componentes. Considera somente
        registros cadastrados. Não é uma pontuação oficial de crédito.
      </p>
      {result.historyMonths < 3 && (
        <p className="muted">
          São necessários três meses completos com registros de renda ou
          despesas antes de apresentar a pontuação. Hoje há{" "}
          {result.historyMonths} mês(es) observados.
        </p>
      )}
      {full ? (
        <div className="score-factors">
          {result.factors.map((f) => (
            <div key={f.label}>
              <div className="split">
                <strong>{f.label}</strong>
                <span>
                  {number(f.earned)} / {f.max}
                </span>
              </div>
              <Progress value={(f.earned / f.max) * 100} />
              <p>{f.explanation}</p>
              <button className="text-btn" onClick={() => navigate(f.page)}>
                Revisar <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button className="text-btn" onClick={() => navigate("insights")}>
          Entender a pontuação <ArrowRight size={15} />
        </button>
      )}
    </section>
  );
}
export function Intelligence({
  navigate,
  view = "assistant",
}: {
  navigate: (p: string) => void;
  view?: "assistant" | "insights";
}) {
  const { doc } = useFinance(),
    [question, setQuestion] = useState(""),
    [history, setHistory] = useState<
      { question: string; answer: ReturnType<typeof assistantAnswer> }[]
    >([]);
  const signals = spendingSignals(doc!),
    budgets = budgetAnalysis(doc!, today().slice(0, 7));
  function ask(text: string) {
    if (!text.trim()) return;
    setHistory((h) => [
      ...h.slice(-19),
      { question: text.slice(0, 600), answer: assistantAnswer(doc!, text) },
    ]);
    setQuestion("");
  }
  if (view === "insights")
    return (
      <div className="intelligence-page">
        <ScoreCard navigate={navigate} full />
        <section className="panel">
          <h2>Gastos para olhar com calma</h2>
          <p className="muted">
            Possíveis gastos incomuns: acima de 2,5 vezes a mediana da categoria
            e pelo menos R$ 100 de diferença, com no mínimo cinco registros
            históricos.
          </p>
          {signals.unusual.length ? (
            signals.unusual.map(({ entity, usual }) => (
              <div className="insight-row" key={entity.id}>
                <div>
                  <strong>{entity.data.description}</strong>
                  <small>
                    {entity.data.category} · referência histórica {money(usual)}
                  </small>
                </div>
                <strong>{money(entity.data.amount)}</strong>
              </div>
            ))
          ) : (
            <p className="calm">
              Nenhum gasto identificado por esse critério nos registros
              disponíveis.
            </p>
          )}
          <button className="text-btn" onClick={() => navigate("transactions")}>
            Revisar movimentações <ArrowRight size={15} />
          </button>
        </section>
        <section className="panel">
          <h2>Cobranças que se repetem</h2>
          <p className="muted">
            Mesmo nome normalizado em pelo menos três meses, com intervalos de
            24 a 40 dias. Sugestões, sem concluir que existe uma assinatura.
          </p>
          {signals.subscriptions.length ? (
            signals.subscriptions.map((s) => (
              <div className="insight-row" key={s.merchant}>
                <div>
                  <strong>{s.description}</strong>
                  <small>
                    {s.count} meses observados
                    {s.increase
                      ? ` · possível reajuste de ${money(s.increase)}`
                      : ""}
                  </small>
                </div>
                <strong>{money(s.amount)}</strong>
              </div>
            ))
          ) : (
            <p className="calm">
              Ainda não há histórico suficiente para sugerir cobranças mensais.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Seu orçamento, com contexto</h2>
          {budgets.length ? (
            budgets.map((b) => (
              <div className="budget-insight" key={b.id}>
                <div className="split">
                  <strong>{b.category}</strong>
                  <span>
                    {money(b.spent)} de {money(b.limit)}
                  </span>
                </div>
                <Progress value={b.limit ? (b.spent / b.limit) * 100 : 100} />
                <p>
                  Mês anterior: {money(b.previous)} · ainda previsto:{" "}
                  {money(b.planned)}.
                  {b.spent + b.planned > b.limit
                    ? ` Revise ${money(b.spent + b.planned - b.limit)} acima do limite considerando previstos.`
                    : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="calm">
              Cadastre limites nas categorias que deseja acompanhar.
            </p>
          )}
          <button className="btn" onClick={() => navigate("budget")}>
            Ajustar orçamento
          </button>
        </section>
      </div>
    );
  return (
    <div className="intelligence-page">
      <section className="assistant-intro">
        <span className="sparkle-icon">
          <Sparkles size={23} />
        </span>
        <span className="eyebrow">HORIZON AI · ANÁLISE LOCAL</span>
        <h2>Mais clareza para seu próximo passo.</h2>
        <p>
          Respostas calculadas a partir dos seus registros, sem enviar seus
          dados a um serviço de inteligência artificial.
        </p>
        <span className="pill">
          Regras e cálculos · sem modelo generativo conectado
        </span>
      </section>
      <div className="assistant-prompts">
        {[
          "Quanto posso economizar este mês?",
          "Qual meta devo priorizar?",
          "Estou gastando mais que o normal?",
          "Quando atingirei R$ 100 mil?",
        ].map((prompt) => (
          <button key={prompt} onClick={() => ask(prompt)}>
            {prompt}
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <div className="assistant-conversation" aria-live="polite">
        {history.map((item, i) => (
          <article key={i} className="panel">
            <div className="assistant-question">{item.question}</div>
            <h3>{item.answer.title}</h3>
            <p>{item.answer.text}</p>
            <small>{item.answer.source}</small>
            <button
              className="text-btn"
              onClick={() => navigate(item.answer.page)}
            >
              Abrir{" "}
              {item.answer.page === "future"
                ? "Meu Futuro"
                : item.answer.page === "goal"
                  ? "Meus Horizontes"
                  : "análise"}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label>
          <span className="sr-only">Sua pergunta financeira</span>
          <input
            aria-label="Sua pergunta financeira"
            value={question}
            maxLength={600}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="O que você quer entender sobre seu dinheiro?"
          />
        </label>
        <button
          className="btn primary"
          disabled={!question.trim()}
          type="submit"
        >
          <Send size={17} />
          <span>Perguntar</span>
        </button>
      </form>
      <p className="footnote">
        Não executa movimentações. Perguntas fora das capacidades locais são
        encaminhadas às ferramentas de planejamento.
      </p>
    </div>
  );
}
