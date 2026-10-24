import { describe, it, expect } from "vitest";
import { calculateMilestoneSavings, quoteNeedsReview, type QuoteRecord } from "../src/core/horizon-intelligence";
const quote:QuoteRecord={source:"Teste",sourceUrl:"https://example.com",label:"Veículo",amount:100000,reference:"outubro 2026",fetchedAt:"2026-10-23T00:00:00Z",locked:false,category:"car",field:"vehicle"};
describe("Horizontes Inteligentes",()=>{
  it("calcula aporte em centavos sem arredondar para baixo",()=>{
    expect(calculateMilestoneSavings(1000,"2027-04-15",100,new Date(2026,9,23))).toMatchObject({months:6,remaining:900,monthly:150});
    expect(calculateMilestoneSavings(1000,"2027-04-15",999,new Date(2026,9,23)).monthly).toBe(.17);
  });
  it("solicita consentimento para alterar preços por padrão",()=>{
    expect(quoteNeedsReview(quote,{...quote,amount:99000},"approval")).toBe("approval");
    expect(quoteNeedsReview(quote,{...quote,amount:99000},"automatic")).toBe("apply");
    expect(quoteNeedsReview({...quote,locked:true},{...quote,amount:99000},"automatic")).toBe("ignore");
    expect(quoteNeedsReview(quote,{...quote,amount:99000},"off")).toBe("ignore");
  });
  it("não usa preços antigos iguais como novas atualizações",()=>{
    expect(quoteNeedsReview(quote,quote,"approval")).toBe("unchanged");
  });
});
