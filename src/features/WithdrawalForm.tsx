import { Modal, DataForm } from "../components/ui";
import { useFinance } from "../core/store";
import { money, today, uid, type Entity } from "../core/model";
import { reservedValue } from "../core/contributions";
export function WithdrawalForm({
  goal,
  entity,
  onClose,
}: {
  goal: Entity;
  entity?: Entity;
  onClose: () => void;
}) {
  const { doc, edit, message } = useFinance();
  return (
    <Modal
      title={entity ? "Editar retirada" : "Registrar retirada"}
      onClose={onClose}
    >
      <p className="info-box">
        Há {money(reservedValue(doc!, goal))} reservados neste horizonte.
        Retirar libera a reserva dentro do app. Seu saldo bancário e seu
        patrimônio continuam iguais.
      </p>
      <DataForm
        initial={entity?.data}
        fields={[
          {
            key: "amount",
            label: "Valor da retirada (R$)",
            type: "number",
            min: 0.01,
            max: 1e9,
            required: true,
          },
          {
            key: "date",
            label: "Data da retirada",
            type: "date",
            default: today(),
            required: true,
          },
          {
            key: "description",
            label: "Descrição da retirada",
            required: true,
            default: "Retirada do horizonte",
          },
        ]}
        submit="Confirmar retirada"
        onSubmit={async (data) => {
          await edit([
            {
              id: entity?.id ?? uid(),
              kind: "contribution",
              data: {
                ...data,
                goalId: goal.id,
                direction: "withdrawal",
                status: "confirmed",
              },
            },
          ]);
          message("Retirada registrada. O valor livre foi atualizado.");
          onClose();
        }}
      />
    </Modal>
  );
}
