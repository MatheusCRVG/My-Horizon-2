/**
 * My Horizon+ 3.0 – shopping offer gateway.
 * API credentials never leave the Worker. Configure SERPAPI_KEY as a secret.
 * Only offers with a verifiable shipping price are compared.
 */
export interface Env { SERPAPI_KEY: string; ALLOWED_ORIGINS?: string; }
type RawOffer = Record<string, unknown>;
type Offer = {id:string;title:string;merchant:string;price:number;shipping:number;url:string;checkedAt:string;availability:"available"|"unknown"};
const round=(v:number)=>Math.round(v*100)/100;
function shippingCost(text: unknown): number | null {
  if(typeof text!=="string")return null;
  const s=text.toLowerCase().trim();
  if(/gr[aá]tis|frete gr[aá]tis|entrega gr[aá]tis|free shipping|free delivery/.test(s)&&!/acima de|a partir de|on orders|over \$/.test(s))return 0;
  const br=s.match(/(?:r\$)\s*([0-9.]+(?:,[0-9]{2})?)/);
  if(br){const n=Number(br[1].replace(/\./g,"").replace(",","."));return Number.isFinite(n)&&n>=0?round(n):null;}
  return null;
}
function https(v:unknown):string|null {
  if(typeof v!=="string")return null;
  try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
function normalize(v:RawOffer,i:number,at:string):Offer|null{
  const title=typeof v.title==="string"?v.title.trim():"";
  const merchant=typeof v.source==="string"?v.source.trim():"";
  const price=v.extracted_price;
  const url=https(v.product_link || v.link);
  // Reject results with a non-BRL currency. A conversion requires an explicit FX quote.
  if (typeof v.currency === "string" && !["BRL","R$"].includes(v.currency.trim())) return null;
  const shipping=shippingCost(v.delivery);
  // No missing freight treated as 0. Unknown delivery must be verified manually.
  if(!title||!merchant||!url||typeof price!=="number"||!Number.isFinite(price)||price<=0||price>1e9||shipping===null)return null;
  return {id:String(v.product_id??i).slice(0,100),title:title.slice(0,220),merchant:merchant.slice(0,100),
    price:round(price),shipping,url,checkedAt:at,availability:"unknown"};
}
const cors=(origin:string, allowed:boolean)=>({
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Vary":"Origin",
  ...(allowed?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"}:{})
});
const json=(body:unknown,status:number,origin:string,allowed:boolean)=>new Response(JSON.stringify(body),{status,headers:cors(origin,allowed)});
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const origin=request.headers.get("Origin")||"";
    const origins=(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
    const allowed=!!origin&&origins.includes(origin);
    // Android WebView may use a custom origin; explicitly add it in ALLOWED_ORIGINS.
    if(!allowed)return json({error:"Origem não autorizada."},403,origin,false);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin,true)});
    if(request.method!=="GET")return json({error:"Método não permitido."},405,origin,true);
    const url=new URL(request.url);
    if(url.pathname!=="/api/prices/search")return json({error:"Rota inexistente."},404,origin,true);
    const query=(url.searchParams.get("q")||"").trim();
    const zip=(url.searchParams.get("zip")||"").replace(/\D/g,"");
    if(query.length<3||query.length>150||zip.length!==0&&zip.length!==8)return json({error:"Pesquisa ou CEP inválido."},400,origin,true);
    if(!env.SERPAPI_KEY)return json({error:"Provedor de preços ainda não configurado."},503,origin,true);
    // Keep the origin-scoped cache low to reduce third-party API usage.
    const cacheUrl=new URL(url.toString());cacheUrl.searchParams.delete("zip");
    cacheUrl.searchParams.set("v","3");
    const key=new Request(cacheUrl.toString(),{method:"GET"});
    const cache=caches.default;
    const cached=await cache.match(key);
    if(cached){const headers=new Headers(cached.headers);Object.entries(cors(origin,true)).forEach(([k,v])=>headers.set(k,v));return new Response(cached.body,{status:cached.status,headers});}
    const provider=new URL("https://serpapi.com/search.json");
    provider.searchParams.set("engine","google_shopping");
    provider.searchParams.set("q",query);
    provider.searchParams.set("google_domain","google.com.br");
    provider.searchParams.set("gl","br");
    provider.searchParams.set("hl","pt");
    provider.searchParams.set("api_key",env.SERPAPI_KEY);
    let response: Response;
    try { response = await fetch(provider,{signal:AbortSignal.timeout(10000)}); }
    catch { return json({error:"Não foi possível consultar os preços agora. Tente novamente."},502,origin,true); }
    if(!response.ok)return json({error:"Provedor de preços temporariamente indisponível."},502,origin,true);
    const raw:unknown=await response.json();
    const data=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
    if(typeof data.error==="string")return json({error:"Consulta recusada pelo provedor."},502,origin,true);
    const candidates=Array.isArray(data.shopping_results)?data.shopping_results:[];
    const now=new Date().toISOString();
    const offers=candidates.slice(0,40).map((x,i)=>x&&typeof x==="object"?normalize(x as RawOffer,i,now):null)
      .filter((x):x is Offer=>x!==null).slice(0,30);
    const result=json({offers,priceBasis:"BRL",shippingVerified:true,queriedAt:now,zipApplied:false,
      note:zip?"Frete não calculado para o CEP. Apenas fretes explicitamente exibidos pelo provedor foram incluídos.":undefined},200,origin,true);
    const cacheResponse=new Response(result.body,{status:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=600"}});
    ctx.waitUntil(cache.put(key,cacheResponse));
    return result;
  }
};