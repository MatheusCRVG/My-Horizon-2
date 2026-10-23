import { read, utils, SSF } from "xlsx";
import { addMonths, rows, today, type Document, type Kind } from "./model";
import { splitInstallments } from "./finance";
export type Candidate = {
  id: string;
  kind: Kind;
  data: Record<string, any>;
  source: string;
  duplicate?: boolean;
  selected: boolean;
};
export type ImportResult = {
  candidates: Candidate[];
  warnings: string[];
  sheets: string[];
};
const normalize = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export function parseAmount(v: unknown) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/R\$|\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw Error(`Valor inválido: ${v}`);
  return n;
}
export function parseDate(v: unknown) {
  if (v instanceof Date)
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") {
    const d = SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  let out = s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) out = s.split("/").reverse().join("-");
  if (/^\d{8,}/.test(s))
    out = s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(out) ||
    Number.isNaN(new Date(out + "T12:00:00").getTime()) ||
    new Date(out + "T12:00:00").toISOString().slice(0, 10) !== out
  )
    throw Error(`Data inválida: ${s || "(vazia)"}`);
  return out;
}
export function parseCSV(text: string) {
  const first = text.split(/\r?\n/)[0];
  const delimiter =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const output: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) output.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) output.push(row);
  if (quoted) throw Error("CSV com aspas não fechadas.");
  return output;
}
const hash = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function importFile(
  file: File,
  doc: Document,
  defaultAccount: string,
): Promise<ImportResult> {
  if (file.size > 20 * 1024 * 1024)
    throw Error("O arquivo deve ter no máximo 20 MB.");
  const result: ImportResult = { candidates: [], warnings: [], sheets: [] };
  const push = async (
    kind: Kind,
    data: Record<string, any>,
    source: string,
    stable?: string,
  ) => {
    const base = stable ?? JSON.stringify(data);
    const id = "import:" + (await hash(kind + ":" + base));
    const duplicate = doc.entities.some(
      (e) =>
        e.id === id ||
        (kind === "transaction" &&
          e.kind === "transaction" &&
          e.data.date === data.date &&
          e.data.description === data.description &&
          Number(e.data.amount) === Number(data.amount) &&
          e.data.accountId === data.accountId),
    );
    result.candidates.push({
      id,
      kind,
      data,
      source,
      duplicate,
      selected: !duplicate,
    });
  };
  const category = (description: string) =>
    rows(doc, "rule").find((r) =>
      normalize(description).includes(normalize(r.data.keyword)),
    )?.data.category ?? "Outros";
  const type = (v: unknown, amount: number) =>
    normalize(v).includes("receita") || normalize(v) === "income"
      ? "income"
      : normalize(v).includes("transf")
        ? "transfer"
        : normalize(v).includes("despesa") || normalize(v) === "expense"
          ? "expense"
          : amount < 0
            ? "expense"
            : "income";
  if (/\.ofx$/i.test(file.name)) {
    const text = await file.text();
    const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
    if (!blocks.length)
      throw Error("Nenhuma transação STMTTRN encontrada no OFX.");
    for (const b of blocks) {
      const tag = (name: string) =>
        b.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))?.[1].trim() ?? "";
      try {
        const signed = parseAmount(tag("TRNAMT"));
        const description = tag("MEMO") || tag("NAME") || tag("TRNTYPE");
        const date = parseDate(tag("DTPOSTED"));
        const bankId = tag("FITID");
        await push(
          "transaction",
          {
            date,
            description,
            type: signed < 0 ? "expense" : "income",
            amount: Math.abs(signed),
            category: category(description),
            accountId: defaultAccount,
            status: "confirmed",
            payment: "pix",
            bankId,
          },
          "OFX",
          bankId ? defaultAccount + ":" + bankId : undefined,
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
    }
    return result;
  }
  if (/\.csv$/i.test(file.name)) {
    const table = parseCSV(await file.text());
    const head = table.shift()?.map(normalize) ?? [];
    const idx = (keys: string[]) =>
      head.findIndex((h) =>
        keys.some((k) => h === k || h.startsWith(k + " (")),
      );
    const di = idx(["data", "date"]),
      de = idx(["descricao", "description", "historico"]),
      va = idx(["valor", "amount", "valor assinado"]),
      ti = idx(["tipo", "type"]),
      ca = idx(["categoria", "category"]),
      st = idx(["situacao", "status"]);
    if (di < 0 || de < 0 || va < 0)
      throw Error(
        "CSV precisa dos cabeçalhos Data;Descrição;Valor. Aceita datas DD/MM/AAAA ou AAAA-MM-DD e valores com sinal.",
      );
    for (const [i, r] of table.entries())
      try {
        const signed = parseAmount(r[va]),
          description = r[de];
        if (!description || !signed) throw Error("Descrição ou valor vazio.");
        const status = normalize(r[st]);
        await push(
          "transaction",
          {
            date: parseDate(r[di]),
            description,
            amount: Math.abs(signed),
            type: type(r[ti], signed),
            category: r[ca] || category(description),
            accountId: defaultAccount,
            status: ["planned", "previsto"].includes(status)
              ? "planned"
              : ["cancelled", "cancelado"].includes(status)
                ? "cancelled"
                : "confirmed",
            payment: "pix",
          },
          `CSV · linha ${i + 2}`,
        );
      } catch (e) {
        result.warnings.push(`Linha ${i + 2}: ${(e as Error).message}`);
      }
    return result;
  }
  if (!/\.xlsx?$/i.test(file.name)) throw Error("Use XLSX, CSV ou OFX.");
  const book = read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
    cellFormula: false,
  });
  result.sheets = book.SheetNames;
  const sheet = (name: string) =>
    book.Sheets[
      book.SheetNames.find((n) => normalize(n) === normalize(name)) ?? ""
    ];
  const table = (name: string) => {
    const s = sheet(name);
    return s
      ? utils.sheet_to_json<any[]>(s, { header: 1, defval: null }).slice(5)
      : [];
  };
  const cell = (name: string, address: string) => sheet(name)?.[address]?.v;
  const accountFor = async (name: unknown) => {
    const label = String(name || "Conta importada");
    const current = rows(doc, "account").find(
      (a) => normalize(a.data.name) === normalize(label),
    );
    if (current) return current.id;
    const id = "import:" + (await hash("account:" + label));
    if (!result.candidates.some((c) => c.id === id)) {
      await push(
        "account",
        {
          name: label,
          institution: "Importada da planilha",
          balance: 0,
          date: "2000-01-01",
        },
        "Lançamentos / conta",
        "account:" + label,
      );
      const candidate = result.candidates.at(-1)!;
      candidate.id = id;
    }
    return id;
  };
  for (const [i, r] of table("Lançamentos").entries()) {
    if (!r[0] || !r[1]) continue;
    try {
      const signed = parseAmount(r[6]);
      if (!signed) continue;
      await push(
        "transaction",
        {
          date: parseDate(r[0]),
          description: String(r[1]),
          type: type(r[2], signed),
          category: r[3] || "Outros",
          payment: normalize(r[4]).includes("credito") ? "credit" : "pix",
          accountId: await accountFor(r[5]),
          amount: Math.abs(signed),
          status: "confirmed",
          notes: r[8] || "",
        },
        `Lançamentos · linha ${i + 6}`,
      );
    } catch (e) {
      result.warnings.push(
        `Lançamentos linha ${i + 6}: ${(e as Error).message}`,
      );
    }
  }
  for (const [i, r] of table("Metas").entries())
    if (r[0] && Number(r[1]) > 0) {
      try {
        await push(
          "goal",
          {
            name: r[0],
            target: parseAmount(r[1]),
            saved: parseAmount(r[2] || 0),
            deadline: parseDate(r[3]),
            priority:
              normalize(r[9]) === "alta"
                ? 3
                : normalize(r[9]) === "baixa"
                  ? 1
                  : 2,
          },
          `Metas · linha ${i + 6}`,
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
    }
  for (const r of table("Orçamento"))
    if (r[0] && Number(r[1]) > 0)
      await push(
        "budget",
        { category: r[0], limit: parseAmount(r[1]) },
        "Orçamento",
      );
  const cards = new Map<string, string>();
  for (const r of table("Cartões"))
    if (r[0] && Number(r[3]) > 0) {
      const data = {
        name: r[7] || r[0],
        institution: "Planilha 4.0",
        closing: Number(r[1]),
        due: Number(r[2]),
        limit: parseAmount(r[3]),
      };
      await push("card", data, "Cartões");
      cards.set(String(r[0]), result.candidates.at(-1)!.id);
    }
  for (const r of table("Compras cartão"))
    if (r[0] && Number(r[3]) > 0) {
      try {
        const cardId = cards.get(String(r[1]));
        if (!cardId) throw Error(`Cartão sem limite/cadastro para ${r[0]}.`);
        const count = Number(r[4] || 1);
        if (!Number.isInteger(count) || count < 1 || count > 120)
          throw Error("Quantidade de parcelas inválida.");
        const amounts = splitInstallments(parseAmount(r[3]), count);
        for (let i = 0; i < count; i++)
          await push(
            "transaction",
            {
              description: r[0],
              cardId,
              purchaseDate: parseDate(r[2]),
              date: addMonths(parseDate(r[5]), i),
              amount: amounts[i],
              type: "expense",
              category: r[8] || "Outros",
              status: normalize(r[9]).includes("cancel")
                ? "cancelled"
                : "confirmed",
              payment: "credit",
              accountId: defaultAccount,
              installment: `${i + 1}/${count}`,
              notes: r[10] || "",
            },
            "Compras cartão",
          );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
    }
  for (const r of table("Recorrentes"))
    if (
      r[0] &&
      Number(r[3]) > 0 &&
      !["nao", "inativo"].includes(normalize(r[7]))
    ) {
      try {
        const start = parseDate(r[5] || today()),
          end = r[6] ? parseDate(r[6]) : addMonths(start, 59);
        let count = 0;
        for (let i = 0; i < 60; i++) {
          const date = addMonths(start, i, Number(r[4] || 1));
          if (date > end) break;
          if (date < today()) continue;
          await push(
            "transaction",
            {
              description: r[0],
              type: type(r[1], 1),
              category: r[2] || "Outros",
              amount: parseAmount(r[3]),
              date,
              status: "planned",
              payment: "pix",
              accountId: defaultAccount,
              frequency: "monthly",
              notes: r[9] || "",
            },
            "Recorrentes (até 60 meses)",
          );
          count++;
        }
        if (!count)
          result.warnings.push(
            `Recorrência ${r[0]} sem datas futuras nos próximos 60 meses a partir do início.`,
          );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
    }
  for (const r of table("Pontuais"))
    if (r[0] && r[1] && Number(r[4]) > 0)
      try {
        await push(
          "transaction",
          {
            date: parseDate(r[0]),
            description: r[1],
            type: type(r[2], 1),
            category: r[3] || "Outros",
            amount: parseAmount(r[4]),
            status: normalize(r[5]).includes("cancel")
              ? "cancelled"
              : "planned",
            accountId: defaultAccount,
            payment: "pix",
            notes: r[6] || "",
          },
          "Pontuais",
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
  for (const r of table("Parcelamentos"))
    if (r[0] && Number(r[2]) > 0 && !normalize(r[7]).includes("cancel"))
      try {
        const amounts = splitInstallments(parseAmount(r[2]), Number(r[3]));
        for (let i = 0; i < amounts.length; i++) {
          const date = addMonths(parseDate(r[4]), i);
          if (date < today()) continue;
          await push(
            "transaction",
            {
              description: r[0],
              amount: amounts[i],
              date,
              type: "expense",
              category: r[1] || "Outros",
              status: "planned",
              accountId: defaultAccount,
              payment: "boleto",
              installment: `${i + 1}/${amounts.length}`,
              notes: r[8] || "",
            },
            "Parcelamentos",
          );
        }
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
  for (const r of table("Patrimônio"))
    if (r[2] && Number(r[3]) > 0)
      try {
        await push(
          "asset",
          {
            name: r[2],
            type:
              normalize(r[0]).includes("div") ||
              normalize(r[0]).includes("passivo")
                ? "debt"
                : "goods",
            amount: parseAmount(r[3]),
            date: parseDate(r[4] || today()),
            notes: r[5] || "",
          },
          "Patrimônio",
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
  for (const r of table("Carteira de Viagens"))
    if (r[0] && r[1] && r[2])
      try {
        await push(
          "trip",
          {
            name: r[0],
            country: "Não informado",
            start: parseDate(r[1]),
            end: parseDate(r[2]),
            people: Number(r[3] || 1),
            currency: r[4] || "BRL",
            exchange: Number(r[5] || 1),
            flights: Number(r[6] || 0),
            hotel: Number(r[7] || 0),
            food: Number(r[8] || 0),
            transport: Number(r[9] || 0),
            tours: Number(r[10] || 0),
            other: Number(r[11] || 0),
            margin: Number(r[12] || 0) * 100,
            saved: Number(r[13] || 0),
            insurance: 0,
            shopping: 0,
          },
          "Carteira de Viagens",
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
  for (const r of table("Gastos anuais"))
    if (r[0] && Number(r[2]) > 0)
      try {
        await push(
          "goal",
          {
            name: `Fundo anual · ${r[0]}`,
            target: parseAmount(r[2]),
            saved: parseAmount(r[3] || 0),
            deadline: parseDate(r[1]),
            priority: 2,
          },
          "Gastos anuais",
        );
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
  for (const r of table("Regras bancárias"))
    if (r[0] && r[1])
      await push("rule", { keyword: r[0], category: r[1] }, "Regras bancárias");
  const cash = Number(cell("Configurações", "B8") || 0),
    reserve = Number(cell("Configurações", "B9") || 0);
  if (cash !== 0) {
    await push(
      "account",
      {
        name: "Saldo atual da planilha",
        institution: "Configurações 4.0",
        balance: cash,
        date: today(),
      },
      "Configurações!B8",
    );
    result.candidates.at(-1)!.selected = false;
    result.warnings.push(
      "Saldo atual da planilha desmarcado: revise a conciliação para não duplicar saldos e lançamentos.",
    );
  }
  if (reserve > 0) {
    await push(
      "asset",
      {
        name: "Reserva acumulada da planilha",
        type: "fixed",
        amount: reserve,
        date: today(),
        notes:
          "Confirme que este valor não está incluído em uma conta bancária.",
      },
      "Configurações!B9",
    );
    result.candidates.at(-1)!.selected = false;
  }
  // Input-only simulation parameters. Computed dashboards and spreadsheet instructions are never imported as transactions.
  const vehiclePrice = Number(cell("Veículo", "B6") || 0);
  if (vehiclePrice > 0)
    await push(
      "simulation",
      {
        name: "Veículo · planilha 4.0",
        tab: "vehicle",
        values: {
          price: vehiclePrice,
          down: Number(cell("Veículo", "B7") || 0),
          months: Number(cell("Veículo", "B8") || 48),
          rate: Number(cell("Veículo", "B9") || 0) * 100,
          fuel:
            (Number(cell("Veículo", "B10") || 0) /
              Math.max(1, Number(cell("Veículo", "B11") || 1))) *
            Number(cell("Veículo", "B12") || 0),
          insurance: Number(cell("Veículo", "B13") || 0),
          ipva: Number(cell("Veículo", "B14") || 0),
          maintenance: Number(cell("Veículo", "B15") || 0),
          parking: Number(cell("Veículo", "B16") || 0),
          horizon: Number(cell("Veículo", "B17") || 5) * 12,
          depreciation: Number(cell("Veículo", "B18") || 0) * 100,
          other: 0,
        },
      },
      "Veículo (premissas)",
    );
  const housingRent = Number(cell("Morar sozinho", "B6") || 0);
  if (housingRent > 0)
    await push(
      "simulation",
      {
        name: "Moradia · planilha 4.0",
        tab: "housing",
        values: {
          rent: housingRent,
          condo: Number(cell("Morar sozinho", "B7") || 0),
          energy: Number(cell("Morar sozinho", "B8") || 0),
          water: Number(cell("Morar sozinho", "B9") || 0),
          internet: Number(cell("Morar sozinho", "B10") || 0),
          food: Number(cell("Morar sozinho", "B11") || 0),
          transport: Number(cell("Morar sozinho", "B12") || 0),
          unexpected:
            Number(cell("Morar sozinho", "B13") || 0) +
            Number(cell("Morar sozinho", "B14") || 0),
          deposit: Number(cell("Morar sozinho", "B15") || 0),
          moving: 0,
          furniture: Number(cell("Morar sozinho", "B16") || 0),
          current: Number(cell("Morar sozinho", "B17") || 0),
          reserveMonths: Number(cell("Morar sozinho", "B18") || 6),
          income: Number(cell("Configurações", "B10") || 0),
        },
      },
      "Morar sozinho (premissas)",
    );
  result.warnings.push(
    "As 39 abas foram reconhecidas por nome. Abas de resultados e fórmulas são recalculadas pelo aplicativo; não são executadas nem copiadas como lançamentos. Revise contas, transferências, compras de cartão e saldos iniciais. O histórico de pagamentos de fatura precisa ser conciliado manualmente.",
  );
  return result;
}
export function validateCandidates(candidates: Candidate[], doc: Document) {
  const selected = candidates.filter((c) => c.selected);
  const available = [...doc.entities.filter((e) => !e.deleted), ...selected];
  for (const c of selected) {
    const d = c.data;
    if (c.kind === "transaction") {
      if (
        !d.description ||
        !Number.isFinite(Number(d.amount)) ||
        Number(d.amount) <= 0
      )
        throw Error("Há lançamento sem descrição ou com valor inválido.");
      parseDate(d.date);
      if (!available.some((a) => a.kind === "account" && a.id === d.accountId))
        throw Error(`Selecione a conta para ${d.description}.`);
      if (
        d.type === "transfer" &&
        (!d.targetAccountId || d.targetAccountId === d.accountId)
      )
        throw Error(
          `Informe uma conta de destino diferente para ${d.description}.`,
        );
      if (
        d.payment === "credit" &&
        !available.some((a) => a.kind === "card" && a.id === d.cardId)
      )
        throw Error(
          `Vincule um cartão válido para ${d.description} ou ajuste a forma de pagamento.`,
        );
    }
  }
  return selected.map(({ id, kind, data }) => ({ id, kind, data }));
}
