import { useState } from "react";
import { RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";
import { useFinance } from "../core/store";
import { money, type Entity } from "../core/model";
import type { QuoteRecord, PriceUpdatePolicy } from "../core/horizon-intelligence";
import { quoteNeedsReview } from "../core/horizon-intelligence";
import { estimateHorizon, type HorizonPlanner } from "../core/horizon-planning";

function parseBRL(input: string) {
  const n = Number(input.replace(/[^0-9,]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw Error("Preço inválido retornado pela fonte.");
  return n;
}
export function PriceReferenceManager({goal}:{goal:Entity}) {
  const {edit,message} = useFinance();
  const quote = goal.data.priceReference as QuoteRecord | undefined;
  const policy = (goal.data.priceUpdatePolicy || "approval") as PriceUpdatePolicy;
  const [candidate,setCandidate] = useState<QuoteRecord|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  if (!quote) return null;
  const change = async (next: QuoteRecord) => {
    if (!goal.data.planner) throw Error("Este horizonte não possui orçamento editável.");
    const planner = goal.data.planner as HorizonPlanner;
    if (planner.type !== next.category) throw Error("O tipo de orçamento mudou. Revise manualmente.");
    const updated = { ...planner, [next.field]: next.amount } as HorizonPlanner;
    const total = estimateHorizon(updated).total;
    await edit([{id:goal.id,kind:goal.kind,expectedVector:goal.vector,
      data:{...goal.data,planner:updated,target:total,priceReference:next,
        priceHistory:[...(goal.data.priceHistory??[]),{at:new Date().toISOString(),before:quote.amount,after:next.amount,source:next.source,reference:next.reference}].slice(-50)}
    }]);
    message("Preço atualizado. O saldo guardado foi preservado; revise os aportes e o prazo.");
    setCandidate(null);
  };
  const refresh = async () => {
    if (!quote.externalId || quote.category !== "car" || !quote.sourceUrl.startsWith("https://fipe.parallelum.com.br/api/v2/cars/")) {
      setError("Para viagens, registre novas cotações no orçamento e confirme a fonte.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(quote.sourceUrl);
      if (!response.ok) throw Error("Serviço de preços indisponível.");
      const raw:unknown = await response.json();
      if (!raw || typeof raw !== "object") throw Error("Resposta inválida.");
      const data = raw as Record<string,unknown>;
      if (typeof data.codeFipe !== "string" || data.codeFipe !== quote.externalId || typeof data.price !== "string" || typeof data.referenceMonth !== "string") throw Error("A versão retornada não corresponde ao veículo salvo.");
      const next = {...quote,amount:parseBRL(data.price),reference:data.referenceMonth,fetchedAt:new Date().toISOString()};
      const choice = quoteNeedsReview(quote,next,policy);
      if (choice==="apply") await change(next);
      else if (choice==="approval") setCandidate(next);
      else message(choice==="unchanged"?"Preço permanece igual.":"Atualização desativada ou preço bloqueado.");
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  };
  return <section className="panel ih3-panel" aria-label="Acompanhamento de preços">
    <div className="ih3-header"><CheckCircle2 size={20}/><div><h3>Referência de preço</h3><small>Dados da sua pesquisa, sujeitos a atualização</small></div></div>
    <strong>{quote.label} — {money(quote.amount)}</strong>
    <p className="muted">{quote.reference} · {quote.source} · consultado {new Date(quote.fetchedAt).toLocaleDateString("pt-BR")}</p>
    <a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">Ver fonte <ExternalLink size={14}/></a>
    <p>Preferência: {policy==="approval"?"Pedir minha aprovação":policy==="automatic"?"Atualizar após verificar a mesma versão":"Atualizações desativadas"}</p>
    {quote.category==="car" && <button className="btn" type="button" disabled={busy || policy==="off"} onClick={()=>void refresh()}><RefreshCw size={16}/>{busy?"Consultando...":"Verificar novo preço"}</button>}
    {candidate && <div className="ih3-quote" role="status"><div><strong>Novo valor: {money(candidate.amount)}</strong><small>{candidate.reference}</small><div className="button-row"><button className="btn" onClick={()=>setCandidate(null)}>Manter atual</button><button className="btn primary" onClick={()=>void change(candidate).catch(e=>setError((e as Error).message))}>Aplicar novo valor</button></div></div></div>}
    {error && <p role="alert" className="error-box">{error}</p>}
    <p className="muted">O app não movimenta dinheiro. Mesmo após mudar o preço, confira os aportes existentes.</p>
  </section>;
}
