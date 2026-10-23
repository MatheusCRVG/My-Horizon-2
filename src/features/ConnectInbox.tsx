import { useState } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowRightLeft, Building2, Check,
  CheckCircle2, Cloud, ExternalLink, FileUp, Inbox, Link2,
  ListFilter, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { Modal } from "../components/ui";
import { accountBalance } from "../core/finance";
import { dateLabel, money, rows, type Entity } from "../core/model";
import { useFinance } from "../core/store";
import {
  duplicateRemovalChanges, exactDuplicateGroups, hasLinkedContribution,
  latestImportedChange, ownTransferChanges, ownTransferSuggestions,
  uncategorizedTransactions, type DuplicateGroup, type TransferSuggestion,
} from "../core/reconciliation";
import "../connect-inbox.css";

type Props = {
  view: "connect" | "inbox";
  navigate: (page: string) => void;
  onEdit: (entity: Entity) => void;
};
type Review = { type: "duplicate"; group: DuplicateGroup } | { type: "transfer"; pair: TransferSuggestion };
type Filter = "all" | "category" | "duplicate" | "transfer";
const timestamp = (value: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Não disponível";

export function ConnectInbox({ view, navigate, onEdit }: Props) {
  const { doc, error: syncError, conflicts, lastSync, pending, demo, edit, message } = useFinance();
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(12);
  const [review, setReview] = useState<Review | null>(null);
  const [removeId, setRemoveId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!doc) return <div className="panel">Desbloqueie seu cofre para continuar.</div>;
  const accounts = rows(doc, "account");
  const categories = uncategorizedTransactions(doc);
  const duplicates = exactDuplicateGroups(doc);
  const transfers = ownTransferSuggestions(doc);
  const imported = latestImportedChange(doc);
  const conflictCount = Math.max(conflicts, doc.conflicts.length);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.data.name || "Conta não disponível";
  const openReview = (next: Review) => {
    setReview(next); setRemoveId(""); setConfirmed(false); setError(""); setSuccess("");
  };
  const closeReview = () => { if (!busy) { setReview(null); setError(""); } };
  const apply = async () => {
    if (!review || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const current = useFinance.getState().doc;
      if (!current) throw Error("Sua sessão foi bloqueada. Desbloqueie o cofre e revise novamente.");
      if (review.type === "duplicate") {
        const keepId = review.group.entries.find((e) => e.id !== removeId)?.id;
        if (!removeId || !keepId) throw Error("Escolha qual registro duplicado deseja excluir.");
        await edit(duplicateRemovalChanges(current, removeId, keepId, review.group.entries.find((e) => e.id === removeId)));
        setSuccess("Registro duplicado excluído. Os demais registros e o histórico protegido foram preservados.");
      } else {
        await edit(ownTransferChanges(current, review.pair.outgoing.id, review.pair.incoming.id, review.pair));
        setSuccess("Transferência própria conciliada. Os saldos das duas contas foram preservados; o par deixou de contar como receita e despesa.");
      }
      message("Conciliação salva no cofre."); setReview(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  };
  const entry = (e: Entity, action?: boolean) => <div className="ci-entry" key={e.id}>
    <span className={`ci-entry-icon ${e.data.type === "income" ? "is-income" : ""}`} aria-hidden="true">
      {e.data.type === "income" ? <ArrowDownLeft size={18} /> : <ArrowRightLeft size={18} />}
    </span>
    <div className="ci-entry-copy"><strong>{e.data.description || "Movimentação sem descrição"}</strong>
      <span>{accountName(e.data.accountId)} · {dateLabel(e.data.date)}{e.data.payment === "credit" ? " · Cartão" : ""}</span>
      <small>{e.data.category || "Sem categoria"} · {e.id.startsWith("import:") ? "Importação manual" : "Registro no aplicativo"}</small>
    </div>
    <strong className="ci-entry-amount">{e.data.type === "expense" ? "− " : e.data.type === "income" ? "+ " : ""}{money(Number(e.data.amount))}</strong>
    {action && <button className="btn" onClick={() => onEdit(e)} aria-label={`Categorizar ${e.data.description}`}>Categorizar</button>}
  </div>;

  return <div className="connect-inbox">
    <div className="ci-heading"><div><span className="eyebrow">Meu dinheiro</span>
      <h2>{view === "connect" ? "Horizon Connect" : "Sua caixa de entrada"}</h2>
      <p>{view === "connect" ? "Suas contas organizadas. Você no controle dos seus dados." : "Pequenas revisões para deixar seus números mais claros."}</p>
    </div><button className="btn primary" onClick={() => navigate("import")}><FileUp size={17} />Importar extrato</button></div>
    {demo && <p className="ci-demo">Você está explorando dados fictícios. As alterações desta demonstração são temporárias.</p>}
    {success && <p className="success-box ci-feedback" role="status"><CheckCircle2 size={20} />{success}</p>}
    {(syncError || conflictCount > 0) && <section className="panel ci-sync-issue" aria-label="Pendências do cofre">
      <TriangleAlert size={21} /><div><h3>{conflictCount ? `${conflictCount} conflito(s) para revisar` : "Confira a sincronização do cofre"}</h3>
        <p>{syncError || "Há versões diferentes de registros. Revise as versões antes de continuar a conciliação."}</p>
        <small>Esta sincronização é do cofre; não representa uma conexão bancária.</small>
      </div><button className="btn" onClick={() => navigate("settings")}>Revisar configurações</button>
    </section>}

    {view === "connect" ? <>
      <section className="panel ci-connect-hero">
        <span className="ci-hero-icon"><Link2 size={28} /></span><div>
          <span className="ci-status"><span />Conexão automática não configurada</span>
          <h3>Comece pelo seu extrato.</h3>
          <p>Importe OFX ou CSV, confira os lançamentos e salve no seu cofre. Importações são manuais e não dão acesso ao seu banco.</p>
          <div className="ci-actions"><button className="btn primary" onClick={() => navigate("import")}>Escolher OFX ou CSV<ArrowRight size={16} /></button>
            <button className="btn" onClick={() => navigate("inbox")}>Revisar pendências<Inbox size={16} /></button></div>
        </div>
      </section>
      <div className="ci-summary"><article className="panel"><Building2 size={20} /><span>Contas cadastradas</span><strong>{accounts.length}</strong><small>Cadastro no aplicativo</small></article>
        <article className="panel"><FileUp size={20} /><span>Registros importados</span><strong>{imported.count}</strong><small>Origem manual · nenhum acesso bancário</small></article>
        <article className="panel"><Cloud size={20} /><span>Proteção do cofre</span><strong>{demo ? "Demonstração" : pending ? "Alterações locais" : lastSync ? "Sincronizado" : "Neste dispositivo"}</strong>
          <small>{lastSync ? `Última sincronização do cofre: ${timestamp(lastSync)}` : "A conexão Google é independente do banco"}</small></article></div>
      <section className="panel ci-accounts"><div className="ci-section-title"><div><h3>Contas e instituições cadastradas</h3><p>Valores calculados pelos registros do aplicativo.</p></div>
        <button className="btn" onClick={() => navigate("account")}>Gerenciar contas</button></div>
        {accounts.length ? <div className="ci-account-grid">{accounts.map((a) => <article key={a.id}>
          <span className="ci-account-logo" aria-hidden="true"><Building2 size={22} /></span><div><h4>{a.data.name}</h4><p>{a.data.institution || "Instituição não informada"}</p><span className="ci-small-label">Cadastro manual · sem conexão automática</span></div>
          <strong>{money(accountBalance(doc, a.id))}</strong></article>)}</div> : <p className="ci-empty-copy">Cadastre uma conta para organizar seu dinheiro e receber seus extratos.</p>}
        {imported.latest && <p className="ci-import-note">Última alteração em registro de origem importada: {timestamp(imported.latest)}. Esta data pode ser uma edição e não informa quando um extrato foi importado.</p>}
      </section>
      <section className="panel ci-future-connect"><div className="ci-section-title"><div><h3>Um próximo passo, com segurança</h3><p>Open Finance permite consultar dados autorizados, com consentimento no seu banco.</p></div><ShieldCheck size={26} /></div>
        <div className="ci-banks"><article><span className="ci-bank-name">Nubank</span><span>Contas, movimentações e cartões</span></article>
          <article><span className="ci-bank-name">Banco do Brasil</span><span>Contas, movimentações e cartões</span></article></div>
        <p>Existe cobertura documentada por parceiros para essas instituições. Ela depende do produto, do consentimento e da disponibilidade do banco; nenhuma conta está conectada aqui.</p>
        <details><summary>O que falta para ativar a conexão automática?</summary><p>Contratação de um parceiro, backend seguro, homologação e gestão de consentimentos. O My Horizon+ usará apenas leitura, sem Pix, pagamentos ou solicitação da sua senha bancária.</p>
          <p>Fontes oficiais de cobertura: <a href="https://docs.pluggy.ai/en/docs/open-finance/institutions-coverage" target="_blank" rel="noopener noreferrer">Pluggy<ExternalLink size={13} /></a> e <a href="https://developers.belvo.com/pt-br/developer_resources/resources-available-institutions" target="_blank" rel="noopener noreferrer">Belvo<ExternalLink size={13} /></a>. Condições comerciais e disponibilidade devem ser confirmadas antes da ativação.</p></details>
      </section>
    </> : <>
      <div className="ci-summary ci-inbox-summary"><button className={`panel ${filter === "category" ? "is-selected" : ""}`} onClick={() => { setFilter("category"); setVisible(12); }}><ListFilter size={20} /><span>Revisar categorias</span><strong>{categories.length}</strong><small>Inclui registros na categoria Outros</small></button>
        <button className={`panel ${filter === "duplicate" ? "is-selected" : ""}`} onClick={() => { setFilter("duplicate"); setVisible(12); }}><Inbox size={20} /><span>Possíveis duplicidades</span><strong>{duplicates.length}</strong><small>Grupos com os mesmos dados</small></button>
        <button className={`panel ${filter === "transfer" ? "is-selected" : ""}`} onClick={() => { setFilter("transfer"); setVisible(12); }}><ArrowRightLeft size={20} /><span>Possíveis transferências próprias</span><strong>{transfers.length}</strong><small>Correspondências para você conferir</small></button></div>
      <div className="ci-filter-row" role="group" aria-label="Filtrar pendências">{([
        ["all", "Tudo"], ["category", "Categorias"], ["duplicate", "Duplicidades"], ["transfer", "Transferências"],
      ] as [Filter, string][]).map(([value, label]) => <button key={value} className={`btn ${filter === value ? "primary" : ""}`} aria-pressed={filter === value} onClick={() => { setFilter(value); setVisible(12); }}>{label}</button>)}</div>
      {(filter === "all" || filter === "category") && <section className="panel ci-inbox-section"><div className="ci-section-title"><div><h3>Categorias para conferir</h3><p>“Outros” pode ser a escolha certa. Altere apenas o que fizer sentido.</p></div><span className="pill">{categories.length}</span></div>
        {categories.slice(0, visible).map((e) => entry(e, true))}{!categories.length && <p className="ci-empty-copy"><CheckCircle2 size={19} />Nenhuma categoria pendente de revisão.</p>}
        {categories.length > visible && <button className="btn" onClick={() => setVisible((n) => n + 12)}>Mostrar mais categorias</button>}</section>}
      {(filter === "all" || filter === "duplicate") && <section className="panel ci-inbox-section"><div className="ci-section-title"><div><h3>Possíveis duplicidades</h3><p>Compras iguais podem ser legítimas. Nenhum lançamento é removido automaticamente.</p></div><span className="pill">{duplicates.length}</span></div>
        {duplicates.slice(0, visible).map((g) => <article className="ci-review-card" key={g.entries[0].id}><div><h4>{g.entries[0].data.description}</h4><p>{g.entries.length} registros · {accountName(g.entries[0].data.accountId)} · {dateLabel(g.entries[0].data.date)}</p><strong>{money(Number(g.entries[0].data.amount))} por registro</strong></div>
          <button className="btn" onClick={() => openReview({ type: "duplicate", group: g })}>Revisar duplicidade</button></article>)}
        {!duplicates.length && <p className="ci-empty-copy"><CheckCircle2 size={19} />Nenhum grupo com os mesmos dados encontrado.</p>}
        {duplicates.length > visible && <button className="btn" onClick={() => setVisible((n) => n + 12)}>Mostrar mais duplicidades</button>}</section>}
      {(filter === "all" || filter === "transfer") && <section className="panel ci-inbox-section"><div className="ci-section-title"><div><h3>Dinheiro entre suas contas?</h3><p>Entradas e saídas com o mesmo valor e data são sugestões, não uma confirmação de transferência.</p></div><span className="pill">{transfers.length}</span></div>
        {transfers.length === 200 && <p className="ci-small-label">Mostramos até 200 correspondências por vez, começando pelas mais recentes. Novas sugestões aparecem conforme você revisa os pares.</p>}
        {transfers.slice(0, visible).map((p) => <article className="ci-review-card" key={p.id}><div><h4>{accountName(p.outgoing.data.accountId)} <ArrowRight size={15} aria-label="para" /> {accountName(p.incoming.data.accountId)}</h4><p>{dateLabel(p.outgoing.data.date)} · {money(Number(p.outgoing.data.amount))}</p>
          {p.ambiguous && <span className="ci-small-label">Mais de uma correspondência: confira com atenção.</span>}{p.linked && <span className="ci-small-label">Há aporte vinculado: o vínculo deve ser revisado antes.</span>}</div>
          <button className="btn" onClick={() => openReview({ type: "transfer", pair: p })}>Revisar par</button></article>)}
        {!transfers.length && <p className="ci-empty-copy"><CheckCircle2 size={19} />Nenhuma correspondência de transferência para revisar.</p>}
        {transfers.length > visible && <button className="btn" onClick={() => setVisible((n) => n + 12)}>Mostrar mais correspondências</button>}</section>}
      <p className="ci-privacy-note"><ShieldCheck size={17} />As revisões usam somente seus registros. Valores não são enviados a bancos nem movimentados.</p>
    </>}

    {review && <Modal title={review.type === "duplicate" ? "Conferir possível duplicidade" : "Conferir transferência própria"} onClose={closeReview}>
      <div className="connect-inbox ci-review-modal">
        {review.type === "duplicate" ? <>
          <p>Compare os registros e escolha apenas um para excluir. Os outros permanecem. A exclusão recalcula os valores do aplicativo.</p>
          <fieldset disabled={busy}><legend>Qual registro realmente está duplicado?</legend>{review.group.entries.map((e, index) => {
            const linked = hasLinkedContribution(doc, e.id);
            return <label className="ci-duplicate-option" key={e.id}><input type="radio" name="remove-duplicate" value={e.id} checked={removeId === e.id} disabled={linked} onChange={() => { setRemoveId(e.id); setConfirmed(false); }} />
              <div><strong>Registro {index + 1}: {e.data.description}</strong><span>{money(Number(e.data.amount))} · {accountName(e.data.accountId)} · {dateLabel(e.data.date)}</span><small>{e.id.startsWith("import:") ? "Importação manual" : "Registro no aplicativo"} · Alterado em {timestamp(e.updatedAt)}</small>
                {e.data.bankId && <small>Identificador bancário: {e.data.bankId}</small>}{linked && <small>Aporte vinculado. Revise o vínculo na meta antes de excluir.</small>}</div></label>;
          })}</fieldset>
          <label className="ci-confirm"><input type="checkbox" checked={confirmed} disabled={busy || !removeId} onChange={(e) => setConfirmed(e.target.checked)} /><span>Conferi os dados e confirmo que o registro escolhido está duplicado e deve ser excluído.</span></label>
        </> : <>
          <p>Confirme que estas duas movimentações representam o mesmo dinheiro entre contas que pertencem a você.</p>
          {entry(review.pair.outgoing)}{entry(review.pair.incoming)}
          <div className="ci-transfer-explainer"><ShieldCheck size={20} /><p>O par será representado por uma única transferência interna. Os saldos das duas contas continuam iguais e o valor deixa de contar como nova receita e nova despesa. Nenhum dinheiro será movimentado no banco.</p></div>
          {review.pair.ambiguous && <p className="ci-warning">Há outras correspondências com esse valor. Confirme qual entrada corresponde a esta saída.</p>}
          {review.pair.linked ? <p className="error-box">Existe aporte vinculado a uma das movimentações. Revise o vínculo nos detalhes da meta antes de conciliar este par.</p> : <label className="ci-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} /><span>As duas contas são minhas e o par representa uma transferência própria, sem compra, pagamento de fatura ou receita externa.</span></label>}
        </>}
        {error && <p className="error-box" role="alert">{error}</p>}
        <div className="ci-review-actions"><button className="btn" disabled={busy} onClick={closeReview}>Cancelar</button><button className="btn primary" disabled={busy || !confirmed || (review.type === "duplicate" && !removeId) || (review.type === "transfer" && review.pair.linked)} onClick={apply}><Check size={17} />{busy ? "Salvando…" : review.type === "duplicate" ? "Excluir registro duplicado" : "Confirmar transferência própria"}</button></div>
      </div>
    </Modal>}
  </div>;
}
