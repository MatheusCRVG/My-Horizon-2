import { useState } from "react";
import {
  Search,
  ArrowUpRight,
  Wallet,
  Tag,
  ArrowLeftRight,
} from "lucide-react";
import { Modal } from "../components/ui";
import { useFinance } from "../core/store";
import { categories, rows, money, type Entity } from "../core/model";
export function GlobalSearch({
  onClose,
  onPick,
  onCategory,
}: {
  onClose: () => void;
  onPick: (entity: Entity) => void;
  onCategory: (name: string) => void;
}) {
  const { doc } = useFinance();
  const [query, setQuery] = useState("");
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const q = norm(query.trim());
  const entities = q
    ? doc!.entities
        .filter(
          (e) =>
            !e.deleted &&
            [
              "transaction",
              "account",
              "goal",
              "card",
              "asset",
              "trip",
            ].includes(e.kind) &&
            norm(String(e.data.description ?? e.data.name ?? "")).includes(q),
        )
        .slice(0, 12)
    : [];
  const cats = q
    ? Array.from(
        new Set([
          ...categories,
          ...rows(doc!, "transaction")
            .map((e) => e.data.category)
            .filter(Boolean),
        ]),
      )
        .filter((c) => norm(c).includes(q))
        .slice(0, 5)
    : [];
  return (
    <Modal title="Tudo ao seu alcance" onClose={onClose}>
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Busca global"
          placeholder="Busque lançamentos, contas, metas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>esc</kbd>
      </div>
      {!q ? (
        <div className="search-intro">
          <span className="tile-icon">
            <Search size={24} />
          </span>
          <h3>Encontre o que precisa.</h3>
          <p>Busque pelo nome de um lançamento, conta, cartão ou objetivo.</p>
        </div>
      ) : (
        <div className="search-results">
          {entities.map((e) => (
            <button key={e.id} onClick={() => onPick(e)}>
              <span className="tile-icon">
                {e.kind === "transaction" ? (
                  <ArrowLeftRight size={17} />
                ) : (
                  <Wallet size={17} />
                )}
              </span>
              <span>
                <strong>{e.data.description ?? e.data.name}</strong>
                <small>
                  {
                    (
                      {
                        transaction: "Lançamento",
                        account: "Conta",
                        goal: "Meta",
                        card: "Cartão",
                        asset: "Patrimônio",
                        trip: "Viagem",
                      } as Record<string, string>
                    )[e.kind]
                  }
                  {e.data.amount ? ` · ${money(e.data.amount)}` : ""}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {cats.map((c) => (
            <button key={c} onClick={() => onCategory(c)}>
              <span className="tile-icon">
                <Tag size={17} />
              </span>
              <span>
                <strong>{c}</strong>
                <small>Ver lançamentos nesta categoria</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!entities.length && !cats.length && (
            <p className="muted calm">Nenhum resultado. Tente outro nome.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
