import { useState } from "react";
import { ExternalLink, Search, CheckCircle2, ShoppingBag } from "lucide-react";
import { money } from "../core/model";
import type { HorizonPlanner } from "../core/horizon-planning";

export type StoreOffer = {
  id: string; title: string; merchant: string; price: number;
  shipping: number; url: string; checkedAt: string; availability: "available" | "unknown";
};
export const totalOffer = (offer: StoreOffer) => Math.round((offer.price + offer.shipping) * 100) / 100;
export function bestOffer(offers: StoreOffer[]) {
  return offers.filter(x=>x.availability==="available").sort((a,b)=>totalOffer(a)-totalOffer(b))[0] ?? null;
}
function validateOffer(v: unknown): StoreOffer | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string,unknown>;
  if (typeof x.id!=="string" || typeof x.title!=="string" || typeof x.merchant!=="string" ||
    typeof x.price!=="number" || !Number.isFinite(x.price) || x.price<=0 || x.price>1e9 ||
    typeof x.shipping!=="number" || !Number.isFinite(x.shipping) || x.shipping<0 || x.shipping>1e8 ||
    typeof x.url!=="string" || !x.url.startsWith("https://") ||
    typeof x.checkedAt!=="string" ||
    !["available","unknown"].includes(String(x.availability))) return null;
  return x as StoreOffer;
}
export function GenericOfferSearch({ planner, onChange, onSelection }: {
  planner: HorizonPlanner;
  onChange: (next: HorizonPlanner) => void;
  onSelection: (data: {query:string; offer:StoreOffer}) => void;
}) {
  const [query,setQuery]=useState("");
  const [offers,setOffers]=useState<StoreOffer[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [zip,setZip]=useState("");
  const [manualTitle,setManualTitle]=useState("");
  const [manualPrice,setManualPrice]=useState("");
  const [manualShipping,setManualShipping]=useState("0");
  const [manualUrl,setManualUrl]=useState("");
  const endpoint=import.meta.env.VITE_PRICE_SEARCH_ENDPOINT as string | undefined;
  const addOffer=(offer:StoreOffer)=>{
    if(planner.type!=="items") return;
    if(planner.items.length>=40){setError("Limite de 40 itens por Horizonte.");return}
    const updated={...planner,items:[...planner.items,{id:crypto.randomUUID(),name:offer.title,amount:totalOffer(offer)}]};
    onChange(updated);
    onSelection({query:query.trim()||offer.title,offer});
    setError("");
  };
  async function search() {
    const q=query.trim();
    if(q.length<3){setError("Descreva o produto com pelo menos 3 caracteres.");return}
    if(!endpoint){setError("Pesquisa automática ainda não configurada. Insira uma oferta manualmente ou abra um comparador.");return}
    setLoading(true);setError("");setOffers([]);
    try{
      const u=new URL(endpoint);
      if(u.protocol!=="https:") throw Error("A pesquisa deve usar uma conexão HTTPS.");
      u.searchParams.set("q",q);
      if(zip.trim()) u.searchParams.set("zip",zip.replace(/\D/g,""));
      const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),12000);
      let response:Response;
      try {response=await fetch(u.toString(),{signal:ctrl.signal,credentials:"omit"});}
      finally{clearTimeout(timer);}
      if(!response.ok) throw Error("Serviço de pesquisa indisponível.");
      const body:unknown=await response.json();
      if(!body||typeof body!=="object"||!Array.isArray((body as {offers?:unknown}).offers)) throw Error("Resposta inválida da pesquisa.");
      const found=(body as {offers:unknown[]}).offers.slice(0,30).map(validateOffer).filter((o):o is StoreOffer=>!!o);
      if(!found.length)throw Error("Nenhuma oferta verificável encontrada. Tente outra descrição.");
      setOffers(found.sort((a,b)=>totalOffer(a)-totalOffer(b)));
    }catch(e){setError((e as Error).message);}
    finally{setLoading(false)}
  }
  const winner=bestOffer(offers);
  return <section className="ih3-panel" aria-label="Pesquisa em lojas">
    <div className="ih3-header"><ShoppingBag size={21}/><div><h4>Pesquisar em várias lojas</h4><small>Compare o preço total e escolha o valor que deseja guardar.</small></div></div>
    <div className="ih3-grid">
      <label className="ih3-field">O que deseja comprar?<input value={query} maxLength={150} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: notebook Acer Nitro 16 GB"/></label>
      <label className="ih3-field">CEP para estimar frete (opcional)<input inputMode="numeric" value={zip} maxLength={9} onChange={e=>setZip(e.target.value)} placeholder="00000-000"/></label>
    </div>
    <button type="button" className="btn primary" disabled={loading} onClick={()=>void search()}><Search size={16}/>{loading?"Pesquisando...":"Buscar preços"}</button>
    {!endpoint&&<p className="muted">Para buscar automaticamente, o responsável pelo app deve configurar o serviço seguro de comparação de preços. Você já pode cadastrar uma oferta pesquisada por conta própria.</p>}
    {winner&&<p className="info-box">Menor oferta disponível entre os resultados desta pesquisa: <strong>{money(totalOffer(winner))}</strong> na {winner.merchant}. Verifique o anúncio antes de comprar.</p>}
    {offers.map(o=><article className="ih3-store-offer" key={o.id}><div><strong>{o.title}</strong><small>{o.merchant} · {new Date(o.checkedAt).toLocaleString("pt-BR")}</small><strong>{money(totalOffer(o))}</strong><small>{money(o.price)} + {money(o.shipping)} de frete</small>{o.availability==="unknown"&&<small>Estoque não confirmado</small>}</div><div className="ih3-store-actions"><a href={o.url} target="_blank" rel="noopener noreferrer">Ver loja <ExternalLink size={14}/></a><button className="btn" type="button" onClick={()=>addOffer(o)}><CheckCircle2 size={15}/> Usar preço</button></div></article>)}
    <details><summary>Adicionar oferta pesquisada manualmente</summary><div className="ih3-grid">
      <label className="ih3-field">Produto<input value={manualTitle} onChange={e=>setManualTitle(e.target.value)}/></label>
      <label className="ih3-field">Preço (R$)<input inputMode="decimal" value={manualPrice} onChange={e=>setManualPrice(e.target.value)}/></label>
      <label className="ih3-field">Frete (R$)<input inputMode="decimal" value={manualShipping} onChange={e=>setManualShipping(e.target.value)}/></label>
      <label className="ih3-field">Link da oferta<input type="url" value={manualUrl} onChange={e=>setManualUrl(e.target.value)} placeholder="https://..."/></label>
    </div><button type="button" className="btn" onClick={()=>{
      const parse=(v:string)=>Number(v.replace(/\./g,"").replace(",","."));
      const price=parse(manualPrice),shipping=parse(manualShipping);
      if(!manualTitle.trim()||!manualUrl.startsWith("https://")||!Number.isFinite(price)||price<=0||!Number.isFinite(shipping)||shipping<0){setError("Informe produto, preço, frete e um link HTTPS válidos.");return}
      addOffer({id:crypto.randomUUID(),title:manualTitle.trim(),merchant:new URL(manualUrl).hostname,price,shipping,url:manualUrl,checkedAt:new Date().toISOString(),availability:"unknown"});
    }}>Adicionar ao orçamento</button></details>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <p className="muted">O menor preço não é garantia de estoque, qualidade ou entrega. Preço e frete podem mudar. Nenhuma compra é realizada pelo app.</p>
  </section>;
}
