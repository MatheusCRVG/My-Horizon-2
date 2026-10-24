import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, CheckCircle2, Search } from "lucide-react";
import { money } from "../core/model";
import type { HorizonPlanner } from "../core/horizon-planning";
import { calculateMilestoneSavings, type QuoteRecord } from "../core/horizon-intelligence";

type SelectItem = { code: string; name: string };
const BASE = "https://fipe.parallelum.com.br/api/v2/cars";
const numberFromBRL = (v: string) => {
  const n = Number(v.replace(/[^0-9,]/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw Error("Preço recebido é inválido.");
  return n;
};
async function list(url: string, signal: AbortSignal): Promise<SelectItem[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error("A fonte de preços não respondeu. Tente novamente.");
  const items: unknown = await response.json();
  if (!Array.isArray(items)) throw Error("Resposta da fonte de preços inválida.");
  return items.filter((x): x is SelectItem => !!x && typeof x.code === "string" && typeof x.name === "string").slice(0, 3500);
}
export function IntelligentResearch({
  planner, onChange, quote, onQuoteChange, policy, onPolicyChange
}: {
  planner: HorizonPlanner;
  onChange: (value: HorizonPlanner) => void;
  quote: QuoteRecord | null;
  onQuoteChange: (value: QuoteRecord | null) => void;
  policy: "approval" | "automatic" | "off";
  onPolicyChange: (value: "approval" | "automatic" | "off") => void;
}) {
  const [brands, setBrands] = useState<SelectItem[]>([]);
  const [models, setModels] = useState<SelectItem[]>([]);
  const [years, setYears] = useState<SelectItem[]>([]);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [bookBy, setBookBy] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [applyTravelField, setApplyTravelField] = useState<"transportCost" | "nightly" | "foodDaily" | "tours" | "local">("transportCost");
  useEffect(() => {
    if (planner.type !== "car") return;
    const c = new AbortController();
    void list(BASE + "/brands", c.signal).then(setBrands).catch(() => {});
    return () => c.abort();
  }, [planner.type]);
  useEffect(() => {
    setModels([]); setModel(""); setYear(""); setYears([]);
    if (!brand) return;
    const c = new AbortController();
    void list(`${BASE}/brands/${encodeURIComponent(brand)}/models`, c.signal)
      .then(setModels).catch(() => setError("Não foi possível carregar modelos."));
    return () => c.abort();
  }, [brand]);
  useEffect(() => {
    setYears([]); setYear("");
    if (!brand || !model) return;
    const c = new AbortController();
    void list(`${BASE}/brands/${encodeURIComponent(brand)}/models/${encodeURIComponent(model)}/years`, c.signal)
      .then(setYears).catch(() => setError("Não foi possível carregar anos."));
    return () => c.abort();
  }, [brand, model]);
  async function lookupCar() {
    if (planner.type !== "car" || !brand || !model || !year) return;
    setBusy(true); setError("");
    try {
      const url = `${BASE}/brands/${encodeURIComponent(brand)}/models/${encodeURIComponent(model)}/years/${encodeURIComponent(year)}`;
      const response = await fetch(url);
      if (!response.ok) throw Error("A consulta de referência falhou.");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw Error("Resposta inesperada.");
      const d = data as Record<string, unknown>;
      if (typeof d.price !== "string" || typeof d.model !== "string" || typeof d.brand !== "string" ||
        typeof d.referenceMonth !== "string" || typeof d.codeFipe !== "string") throw Error("Campos obrigatórios ausentes.");
      const amount = numberFromBRL(d.price);
      const label = `${d.brand} ${d.model} ${String(d.modelYear || "")}`;
      // Only a verified result with an exact model identifier can update the budget.
      onChange({ ...planner, model: label, vehicle: amount });
      onQuoteChange({ source: "Fipe API (provedor independente)", sourceUrl: url, label,
        amount, reference: d.referenceMonth, fetchedAt: new Date().toISOString(),
        externalId: d.codeFipe, locked: false, category: "car", field: "vehicle" });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const choose = (items: SelectItem[], value: string, change: (v: string) => void, name: string) => (
    <label className="ih3-field">{name}
      <select value={value} onChange={e => change(e.target.value)}>
        <option value="">Selecione...</option>
        {items.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
      </select>
    </label>
  );
  return <section className="ih3-panel">
    <div className="ih3-header"><Search size={18}/><div><h4>Pesquisar preços na internet</h4><small>Você pode editar qualquer valor depois da pesquisa.</small></div></div>
    {!navigator.onLine && <p role="status" className="info-box">Sem internet. Você ainda pode preencher os valores manualmente.</p>}
    {planner.type === "car" && <>
      <div className="ih3-grid">
        {choose(brands, brand, setBrand, "Marca")}
        {choose(models, model, setModel, "Modelo e versão")}
        {choose(years, year, setYear, "Ano e combustível")}
      </div>
      <button type="button" className="btn primary" disabled={busy || !brand || !model || !year || !navigator.onLine} onClick={()=>void lookupCar()}>
        <RefreshCw size={16}/> {busy ? "Consultando…" : "Consultar referência FIPE"}
      </button>
      <p className="muted">Referência média, não oferta de venda. A pesquisa usa um provedor independente, com limite de consultas.</p>
    </>}
    {planner.type === "travel" && <>
      <div className="ih3-grid">
        <label className="ih3-field">Cidade de origem<input value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="Sorocaba ou São Paulo"/></label>
        <label className="ih3-field">Comprar passagens até<input type="date" value={bookBy} onChange={e=>setBookBy(e.target.value)}/></label>
      </div>
      <p>Confira tarifas nas fontes de sua preferência. Uma passagem para uma data futura só é confirmada pelo fornecedor; não substituímos cotação por um valor inventado.</p>
      <a className="text-btn" href="https://www.google.com/travel/flights" target="_blank" rel="noopener noreferrer">Pesquisar voos no navegador <ArrowUpRight size={15}/></a>
      <div className="ih3-grid">
        <label className="ih3-field">Tipo de custo<select value={applyTravelField} onChange={e=>setApplyTravelField(e.target.value as typeof applyTravelField)}>
          <option value="transportCost">Passagens / transporte</option><option value="nightly">Hospedagem por noite</option>
          <option value="foodDaily">Alimentação diária</option><option value="tours">Passeios</option><option value="local">Transporte local</option>
        </select></label>
        <label className="ih3-field">Preço encontrado (R$)<input inputMode="decimal" value={sourceAmount} onChange={e=>setSourceAmount(e.target.value)} placeholder="Ex.: 2500,00"/></label>
        <label className="ih3-field">Endereço da fonte<input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..."/></label>
        <label className="ih3-field">Descrição da cotação<input value={sourceNote} onChange={e=>setSourceNote(e.target.value)} placeholder="Ida e volta, bagagem inclusa"/></label>
      </div>
      <button type="button" className="btn primary" onClick={()=>{
        try {
          if (planner.type !== "travel" || !sourceUrl.startsWith("https://")) throw Error("Informe uma fonte HTTPS.");
          const amount = numberFromBRL(sourceAmount);
          onChange({ ...planner, [applyTravelField]: amount });
          onQuoteChange({source:"Preço informado pelo usuário",sourceUrl,label:sourceNote || "Cotação de viagem",
            amount,reference:"Consulta informada pelo usuário",fetchedAt:new Date().toISOString(),locked:false,
            category:"travel",field:applyTravelField,origin,bookBy});
          setError("");
        } catch(e) {setError((e as Error).message)}
      }}>Usar este preço no planejamento <CheckCircle2 size={16}/></button>
      {planner.date && <p className="muted">Passagens compradas antes da viagem? Inclua a data de compra na simulação para dividir o dinheiro por etapa.</p>}
      {bookBy && planner.date && <p className="info-box">Passagens até {bookBy}: {money(calculateMilestoneSavings(planner.transportCost*(planner.transportUnit==="person"?planner.people:1), bookBy).monthly)}/mês estimados, sem rendimento. A hospedagem e os outros custos continuam na meta total.</p>}
    </>}
    {quote && <div className="ih3-quote"><CheckCircle2 size={18}/><div><strong>{quote.label}: {money(quote.amount)}</strong><small>Fonte: {quote.source} · {quote.reference} · consultado {new Date(quote.fetchedAt).toLocaleDateString("pt-BR")}</small><a href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">Ver origem <ArrowUpRight size={13}/></a></div></div>}
    <label className="ih3-field">Atualizações futuras<select value={policy} onChange={e=>onPolicyChange(e.target.value as typeof policy)}>
      <option value="approval">Avisar e pedir minha aprovação</option>
      <option value="automatic">Aplicar automaticamente quando a consulta for validada</option>
      <option value="off">Não atualizar o preço</option>
    </select></label>
    <p className="muted">Preferência salva no Horizonte. Atualizações em segundo plano requerem serviço de monitoramento configurado; esta versão consulta quando você solicita.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
  </section>;
}
