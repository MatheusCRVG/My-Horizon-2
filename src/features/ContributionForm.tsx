import { useState } from "react";
import { Modal } from "../components/ui";
import { useFinance } from "../core/store";
import { dateLabel, money, rows, today, uid, type Entity } from "../core/model";
import {
  objectives,
  revisedPlan,
  occurrences,
  planStreams,
} from "../core/contributions";
import { addMonths } from "../core/model";
import { savingSummary } from "../core/saving-targets";

export async function saveContribution(
  goal: Entity,
  entry: Entity,
  deleted = false,
) {
  const { doc, edit } = useFinance.getState();
  const change = { ...entry, deleted };
  const next = {
    ...doc!,
    entities: [...doc!.entities.filter((e) => e.id !== entry.id), change],
  };
  const previous = doc!.entities.find((e) => e.id === entry.id);
  const changes: Entity[] = [change];
  if (
    goal.data.plan &&
    ((entry.data.extra && entry.data.effect === "reduce") ||
      (previous?.data.extra && previous.data.effect === "reduce"))
  ) {
    const s = savingSummary(next, goal);
    if (s.required !== null)
      changes.push({
        ...goal,
        data: revisedPlan(goal, {
          ...s.plan,
          mode: "date",
          effective: today(),
          monthly: s.required,
        }),
      });
  }
  await edit(changes);
}
export function ContributionForm({
  goal: selected,
  entity,
  onClose,
}: {
  goal?: Entity;
  entity?: Entity;
  onClose: () => void;
}) {
  const { doc, message } = useFinance();
  const choices = objectives(doc!);
  const [goalId, setGoalId] = useState(
    entity?.data.goalId ?? selected?.id ?? choices[0]?.id ?? "",
  );
  const [data, setData] = useState({
    amount: entity?.data.amount ?? "",
    description: entity?.data.description ?? "Aporte para meu objetivo",
    date: entity?.data.date ?? today(),
    status: entity?.data.status ?? "confirmed",
    extra: entity?.data.extra ?? false,
    effect: entity?.data.effect ?? "advance",
    sourceId: entity?.data.sourceId ?? "",
    transactionId: entity?.data.transactionId ?? "",
    streamId: entity?.data.streamId ?? "",
    scheduledDate: entity?.data.scheduledDate ?? "",
    wasPlanned: entity?.data.wasPlanned || entity?.data.status === "planned",
    plannedDate:
      entity?.data.plannedDate ||
      (entity?.data.status === "planned" ? entity.data.date : ""),
    plannedAmount:
      entity?.data.plannedAmount ??
      (entity?.data.status === "planned" ? entity.data.amount : undefined),
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const goal = choices.find((g) => g.id === goalId),
    summary = goal ? savingSummary(doc!, goal) : null;
  const sources = [
    ...rows(doc!, "account"),
    ...rows(doc!, "asset").filter((e) =>
      ["fixed", "variable", "other"].includes(e.data.type),
    ),
  ];
  const linked = rows(doc!, "transaction").filter(
    (e) =>
      e.data.type !== "expense" &&
      !e.data.cardPayment &&
      e.data.status === "confirmed" &&
      e.data.date <= today(),
  );
  const change = (patch: Partial<typeof data>) =>
    setData((d) => ({ ...d, ...patch }));
  return (
    <Modal
      title={entity ? "Editar aporte" : "Registrar aporte"}
      onClose={onClose}
    >
      <p className="muted">
        Reserve dinheiro que já está nas suas contas ou investimentos. Este
        registro não cria receita nem despesa.
      </p>
      {!choices.length ? (
        <p className="info-box">
          Crie uma meta ou viagem antes de registrar seu primeiro aporte.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (!goal) throw Error("Selecione um objetivo.");
              await saveContribution(goal, {
                id: entity?.id ?? uid(),
                kind: "contribution",
                vector: entity?.vector ?? {},
                updatedAt: entity?.updatedAt ?? new Date().toISOString(),
                data: {
                  ...data,
                  wasPlanned: !!data.wasPlanned || data.status === "planned",
                  plannedDate:
                    data.status === "planned" ? data.date : data.plannedDate,
                  plannedAmount:
                    data.status === "planned"
                      ? Number(data.amount)
                      : data.plannedAmount,
                  amount: Number(data.amount),
                  description: data.description.trim(),
                  goalId,
                },
              });
              message(
                data.status === "confirmed"
                  ? "Aporte confirmado. Sua evolução foi atualizada."
                  : "Aporte previsto salvo. O valor reservado não mudou.",
              );
              onClose();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid saving-fields">
            <label className="span-2">
              Meta ou viagem
              <select
                aria-label="Meta ou viagem"
                value={goalId}
                disabled={!!entity}
                onChange={(e) => setGoalId(e.target.value)}
              >
                {choices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.data.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valor do aporte (R$)
              <input
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                value={data.amount}
                required
                onChange={(e) => change({ amount: e.target.value })}
              />
            </label>
            <label>
              Data do aporte
              <input
                type="date"
                required
                value={data.date}
                onChange={(e) => change({ date: e.target.value })}
              />
            </label>
            <label className="span-2">
              Descrição do aporte
              <input
                value={data.description}
                maxLength={160}
                required
                onChange={(e) => change({ description: e.target.value })}
              />
            </label>
            <label>
              Status do aporte
              <select
                aria-label="Status do aporte"
                value={data.status}
                onChange={(e) => change({ status: e.target.value })}
              >
                <option value="confirmed">Confirmado · já guardei</option>
                <option value="planned">Previsto · ainda vou guardar</option>
              </select>
            </label>
            <label>
              Origem da reserva
              <select
                aria-label="Origem da reserva"
                value={data.sourceId}
                onChange={(e) => change({ sourceId: e.target.value })}
              >
                <option value="">Saldo global livre</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.data.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Vincular a uma movimentação existente (opcional)
              <select
                aria-label="Vincular a uma movimentação existente"
                value={data.transactionId}
                onChange={(e) => {
                  const tx = linked.find((t) => t.id === e.target.value);
                  change({
                    transactionId: e.target.value,
                    ...(tx
                      ? {
                          date: tx.data.date,
                          sourceId:
                            tx.data.targetAccountId || tx.data.accountId || "",
                          amount: tx.data.amount,
                        }
                      : {}),
                  });
                }}
              >
                <option value="">Sem vínculo · apenas reservar</option>
                {linked.map((t) => (
                  <option key={t.id} value={t.id}>
                    {dateLabel(t.data.date)} · {t.data.description} ·{" "}
                    {money(t.data.amount)}
                  </option>
                ))}
              </select>
              <small>
                Entradas e transferências próprias podem ser vinculadas uma
                única vez. O lançamento existente será preservado.
              </small>
            </label>
            <label className="checkbox span-2">
              <input
                type="checkbox"
                checked={data.extra}
                onChange={(e) => change({ extra: e.target.checked })}
              />
              Este é um aporte extra
            </label>
            {goal?.data.plan && (
              <>
                <label className="span-2">
                  Referente a um aporte do plano (opcional)
                  <select
                    value={data.streamId}
                    onChange={(e) => {
                      const stream = planStreams(goal.data.plan).find(
                        (s) => s.id === e.target.value,
                      );
                      const next = stream
                        ? occurrences(
                            [stream],
                            today(),
                            addMonths(today(), 600),
                          )[0]
                        : null;
                      change({
                        streamId: e.target.value,
                        scheduledDate: next?.date ?? "",
                      });
                    }}
                  >
                    <option value="">
                      Sem vínculo com uma ocorrência prevista
                    </option>
                    {planStreams(goal.data.plan).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.description}
                      </option>
                    ))}
                  </select>
                  <small>
                    Use este vínculo para registrar antecipadamente um aporte
                    previsto e evitar repeti-lo na previsão.
                  </small>
                </label>
                {data.streamId && (
                  <label className="span-2">
                    Data prevista no planejamento
                    <input
                      type="date"
                      value={data.scheduledDate}
                      required
                      onChange={(e) =>
                        change({ scheduledDate: e.target.value })
                      }
                    />
                  </label>
                )}
              </>
            )}
            {data.extra && (
              <label className="span-2">
                Como aproveitar o aporte extra
                <select
                  aria-label="Como aproveitar o aporte extra"
                  value={data.effect}
                  onChange={(e) => change({ effect: e.target.value })}
                >
                  <option value="advance">
                    Manter os aportes e antecipar a conclusão
                  </option>
                  <option value="reduce">
                    Manter a data e reduzir os próximos aportes
                  </option>
                </select>
                <small>
                  {goal?.data.plan
                    ? "O plano será recalculado após a confirmação."
                    : "Configure o planejamento para aplicar esta escolha ao prazo."}
                </small>
              </label>
            )}
          </div>
          {summary && (
            <p className="info-box">
              Já reservado: {money(summary.saved)} · Falta para a meta:{" "}
              {money(summary.remaining)}
            </p>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="btn" type="button" onClick={onClose}>
              Voltar
            </button>
            <button className="btn primary" disabled={busy}>
              {busy
                ? "Salvando…"
                : data.status === "confirmed"
                  ? "Confirmar aporte"
                  : "Salvar aporte previsto"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
