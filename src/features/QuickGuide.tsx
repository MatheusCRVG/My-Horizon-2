import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Target,
  CreditCard,
  Calculator,
  ArrowRight,
} from "lucide-react";
import { Modal } from "../components/ui";
export function QuickGuide({
  onClose,
  navigate,
  add,
}: {
  onClose: () => void;
  navigate: (page: string) => void;
  add: (type: "income" | "expense") => void;
}) {
  return (
    <Modal title="Seu dinheiro, passo a passo" onClose={onClose}>
      <p className="muted">
        Comece pelo que você já tem. Registre os movimentos e acompanhe seus
        planos.
      </p>
      <div className="quick-guide-list">
        <button onClick={() => navigate("account")}>
          <span className="tile-icon">
            <Wallet size={21} />
          </span>
          <span>
            <strong>1. Cadastre suas contas</strong>
            <small>Informe onde está seu dinheiro e o saldo de abertura.</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <div className="guide-movements">
          <strong>2. Registre entradas e saídas</strong>
          <p>Receita é o dinheiro que entra. Despesa é o dinheiro que sai.</p>
          <div>
            <button className="btn" onClick={() => add("income")}>
              <ArrowDownLeft size={17} />
              Registrar receita
            </button>
            <button className="btn primary" onClick={() => add("expense")}>
              <ArrowUpRight size={17} />
              Registrar despesa
            </button>
          </div>
        </div>
        <button onClick={() => navigate("card")}>
          <span className="tile-icon">
            <CreditCard size={21} />
          </span>
          <span>
            <strong>3. Acompanhe seus cartões</strong>
            <small>
              Cadastre o cartão, registre as compras e confira as faturas.
            </small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button onClick={() => navigate("goal")}>
          <span className="tile-icon">
            <Target size={21} />
          </span>
          <span>
            <strong>4. Dê um destino ao seu dinheiro</strong>
            <small>Crie metas e reserve valores para seus objetivos.</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button onClick={() => navigate("simulations")}>
          <span className="tile-icon">
            <Calculator size={21} />
          </span>
          <span>
            <strong>Antes de decidir, simule</strong>
            <small>
              Teste compras, viagens ou investimentos sem alterar seu saldo.
            </small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
      <p className="guide-tip">
        Dica: use a busca no topo para encontrar lançamentos, contas e metas. No
        celular, abra o menu “Mais”.
      </p>
    </Modal>
  );
}
