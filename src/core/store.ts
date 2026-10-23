import { create } from "zustand";
import { db } from "./db";
import {
  createKeys,
  decryptDocument,
  encryptDocument,
  envelopeSchema,
  unlock,
  type Envelope,
  type VaultKeys,
} from "./crypto";
import { editDocument, mergeDocuments, assertEditRevision } from "./merge";
import {
  emptyDocument,
  uid,
  addMonths,
  type Document,
  type Entity,
} from "./model";
import * as google from "./google";
import * as account from "../services/auth/client";
import { repository } from "../services/storage/repository";
import { runExclusive } from "../services/storage/lock";
import {
  createOperations,
  createRpcTransport,
  syncVault,
  SyncCancelledError,
} from "../services/sync";
import { validateContributions } from "./contributions";
import { totals, accountBalance } from "./finance";
type Change = Pick<Entity, "id" | "kind" | "data" | "deleted"> & {
  expectedVector?: Entity["vector"];
  expectedMovements?: string;
};
type State = {
  doc: Document | null;
  keys: VaultKeys | null;
  owner: string;
  device: string;
  demo: boolean;
  pending: boolean;
  lastSync: string;
  syncing: boolean;
  error: string;
  notice: string;
  conflicts: number;
  cloudLinked: boolean;
  recoverySecret: string;
  acknowledgeRecovery: () => void;
  open: (e: Envelope, password: string, recovery?: boolean) => Promise<void>;
  create: (password: string, owner: string) => Promise<string>;
  edit: (changes: Change[]) => Promise<void>;
  sync: (manual?: boolean) => Promise<void>;
  lock: () => void;
  demoStart: () => void;
  backup: () => Promise<Envelope>;
  restore: (e: Envelope, password: string, recovery?: boolean) => Promise<void>;
  message: (s: string) => void;
};
let epoch = 0;
let activeSync: AbortController | null = null;
const serial = runExclusive;
const withLock = <T>(fn: () => Promise<T>) => fn();
export const useFinance = create<State>((set, get) => ({
  doc: null,
  keys: null,
  owner: "",
  device: "",
  demo: false,
  pending: false,
  lastSync: "",
  syncing: false,
  error: "",
  notice: "",
  conflicts: 0,
  cloudLinked: false,
  recoverySecret: "",
  acknowledgeRecovery: () => set({ recoverySecret: "" }),
  message: (notice) => set({ notice }),
  open: async (e, password, recovery = false) => {
    const openingEpoch = epoch;
    const keys = await unlock(e, password, recovery);
    const opened = await serial(async () => {
      if (epoch !== openingEpoch)
        throw Error("A sess\u00e3o mudou durante o desbloqueio.");
      let doc = await decryptDocument(e, keys);
      const old = await db.vaults.get(e.owner);
      const session = account.currentSession();
      if (old?.accountId && session && old.accountId !== session.user.id)
        throw Error("Este cofre pertence a outra conta do My Horizon+.");
      if (
        old?.authorized === false &&
        (!session || session.user.id !== old.accountId)
      )
        throw Error(
          "Entre online na sua conta para autorizar novamente este dispositivo.",
        );
      if (old)
        doc = mergeDocuments(doc, await decryptDocument(old.envelope, keys));
      const envelope = await encryptDocument(doc, keys);
      const device = old?.device ?? uid();
      const operations =
        !old?.accountId && !(await repository.outbox(e.owner)).length
          ? await createOperations(emptyDocument(), doc, keys, e.owner)
          : [];
      await repository.commit(
        {
          ...old,
          owner: e.owner,
          envelope,
          device,
          pending: old?.pending || operations.length > 0,
          lastSync: old?.lastSync,
          seen: old?.seen ?? [],
        },
        operations,
      );
      epoch++;
      set({
        doc,
        keys,
        owner: e.owner,
        device,
        demo: false,
        pending: old?.pending || operations.length > 0,
        lastSync: old?.lastSync ?? "",
        error: "",
        conflicts: doc.conflicts.length,
        cloudLinked: !!old?.accountId,
      });
      return { old, session, activeEpoch: epoch };
    });
    if (epoch !== opened.activeEpoch) return;
    if (opened.session && opened.old?.accountId === opened.session.user.id)
      await account.rememberSession(keys);
    else if (opened.old?.session)
      void account
        .resumeSession(opened.old, keys)
        .then(() => get().sync())
        .catch((e) => {
          if (epoch === opened.activeEpoch)
            set({ error: (e as Error).message });
        });
  },
  create: async (password, owner) => {
    const creatingEpoch = epoch;
    const created = await createKeys(password, owner);
    const doc = emptyDocument();
    const device = uid();
    const envelope = await encryptDocument(doc, created.keys);
    await serial(async () => {
      if (epoch !== creatingEpoch)
        throw Error(
          "A sess\u00e3o mudou durante a cria\u00e7\u00e3o do cofre.",
        );
      if (await db.vaults.get(owner))
        throw Error(
          "Já existe um cofre local. Desbloqueie ou restaure o backup.",
        );
      await repository.put({
        owner,
        envelope,
        device,
        pending: true,
        seen: [],
        accountId:
          owner === account.currentSession()?.user.id ? owner : undefined,
        authorized: true,
        cursor: 0,
      });
    });
    if (epoch !== creatingEpoch) throw Error("A sess\u00e3o foi encerrada.");
    epoch++;
    set({
      doc,
      keys: created.keys,
      owner,
      device,
      demo: false,
      pending: true,
      error: "",
      lastSync: "",
      conflicts: 0,
      recoverySecret: created.recovery,
      cloudLinked: owner === account.currentSession()?.user.id,
    });
    if (owner === account.currentSession()?.user.id)
      await account.rememberSession(created.keys);
    return created.recovery;
  },
  edit: async (changes) => {
    // Local writes take priority over a slow network exchange. Its UUIDs stay queued.
    activeSync?.abort();
    const session = epoch;
    return serial(() =>
      withLock(async () => {
        const s = get();
        if (!s.doc) throw Error("Desbloqueie o cofre.");
        let doc = s.doc;
        if (!s.demo) {
          const local = await db.vaults.get(s.owner);
          if (local && s.keys)
            doc = mergeDocuments(
              doc,
              await decryptDocument(local.envelope, s.keys),
            );
        }
        const previous = doc;
        for (const { expectedVector, expectedMovements, ...c } of changes) {
          assertEditRevision(doc, c.id, expectedVector, expectedMovements);
          doc = editDocument(doc, c, s.device);
        }
        const funds = totals(doc, new Date().toISOString().slice(0, 7));
        validateContributions(
          doc,
          previous,
          funds.balance + funds.invested - funds.committed,
          (id) => {
            const asset = doc.entities.find(
              (e) => e.id === id && e.kind === "asset" && !e.deleted,
            );
            return asset &&
              ["fixed", "variable", "other"].includes(asset.data.type)
              ? Number(asset.data.amount)
              : accountBalance(doc, id);
          },
        );
        if (session !== epoch) return;
        if (!s.demo && s.keys) {
          const envelope = await encryptDocument(doc, s.keys);
          const old = await db.vaults.get(s.owner);
          if (session !== epoch) return;
          const operations = await createOperations(
            previous,
            doc,
            s.keys,
            s.owner,
          );
          await repository.commit(
            { ...old!, envelope, pending: true },
            operations,
          );
        }
        set({
          doc,
          pending: !s.demo,
          conflicts: doc.conflicts.length,
          error: "",
        });
      }),
    );
  },
  sync: async (manual = false) => {
    const sessionEpoch = epoch;
    const initial = get();
    if (initial.syncing || initial.demo || !initial.keys || !navigator.onLine)
      return;
    const local = await repository.get(initial.owner);
    if (get().syncing || sessionEpoch !== epoch) return;
    if (!local?.accountId) {
      set({
        cloudLinked: false,
        ...(manual
          ? {
              notice:
                "Seu cofre está salvo neste dispositivo. Conecte uma conta nas configurações para sincronizar.",
            }
          : {}),
      });
      return;
    }
    const controller = new AbortController();
    activeSync = controller;
    const offline = () => controller.abort();
    window.addEventListener("offline", offline, { once: true });
    set({ syncing: true, cloudLinked: true, error: "" });
    try {
      if (!account.currentSession())
        await account.resumeSession(local, initial.keys);
      await serial(async () => {
        const s = get();
        if (!s.keys || !s.doc || sessionEpoch !== epoch) return;
        const verified = account.currentSession();
        if (!verified || verified.user.id !== local.accountId)
          throw Error("Entre na mesma conta do My Horizon+ para sincronizar.");
        const record = await repository.get(s.owner);
        if (!record) throw Error("Cofre local indispon\u00edvel.");
        const transport = createRpcTransport({
          accountId: verified.user.id,
          active: () =>
            sessionEpoch === epoch &&
            !controller.signal.aborted &&
            navigator.onLine &&
            account.currentSession()?.user.id === verified.user.id,
          rpc: (name, args) =>
            account.client().rpc(name, args).abortSignal(controller.signal),
        });
        const result = await syncVault({
          record,
          keys: s.keys,
          doc: s.doc,
          repository,
          transport,
          active: () =>
            sessionEpoch === epoch &&
            !controller.signal.aborted &&
            navigator.onLine &&
            account.currentSession()?.user.id === verified.user.id,
        });
        if (sessionEpoch === epoch)
          set({
            doc: result.doc,
            pending: result.record.pending,
            lastSync: result.record.lastSync ?? "",
            conflicts: result.doc.conflicts.length,
          });
      });
    } catch (e) {
      if (
        sessionEpoch === epoch &&
        !controller.signal.aborted &&
        !(e instanceof SyncCancelledError)
      )
        set({ error: (e as Error).message });
    } finally {
      window.removeEventListener("offline", offline);
      if (activeSync === controller) activeSync = null;
      if (sessionEpoch === epoch) set({ syncing: false });
    }
  },
  lock: () => {
    activeSync?.abort();
    epoch++;
    google.forgetToken();
    account.forgetSession();
    set({
      doc: null,
      keys: null,
      owner: "",
      device: "",
      demo: false,
      pending: false,
      lastSync: "",
      syncing: false,
      error: "",
      notice: "",
      conflicts: 0,
      recoverySecret: "",
      cloudLinked: false,
    });
  },
  demoStart: () => {
    epoch++;
    account.forgetSession();
    google.forgetToken();
    set({
      doc: demoDocument(),
      keys: null,
      owner: "demo",
      device: "demo",
      demo: true,
      pending: false,
      lastSync: "",
      error: "",
      conflicts: 0,
      cloudLinked: false,
    });
  },
  backup: async () => {
    const s = get();
    if (!s.keys || !s.doc)
      throw Error("Backups estão disponíveis no seu cofre real.");
    return encryptDocument(s.doc, s.keys);
  },
  restore: async (e, password, recovery = false) => {
    const session = epoch;
    envelopeSchema.parse(e);
    const s = get();
    if (e.owner !== s.owner) throw Error("O backup pertence a outro cofre.");
    const keys = await unlock(e, password, recovery);
    const doc = await decryptDocument(e, keys);
    if (s.keys && e.vaultId !== s.keys.header.vaultId)
      throw Error(
        "Backup de um cofre diferente. Use a restauração na tela inicial em um dispositivo sem cofre.",
      );
    await serial(() =>
      withLock(async () => {
        const local = await db.vaults.get(e.owner);
        let merged = get().doc ? mergeDocuments(get().doc!, doc) : doc;
        if (local)
          merged = mergeDocuments(
            merged,
            await decryptDocument(local.envelope, keys),
          );
        const envelope = await encryptDocument(merged, keys);
        if (session !== epoch)
          throw Error(
            "A sessão foi bloqueada. Desbloqueie antes de restaurar.",
          );
        const operations = await createOperations(
          get().doc || emptyDocument(),
          merged,
          keys,
          e.owner,
        );
        await repository.commit(
          {
            ...local!,
            owner: e.owner,
            device: s.device || uid(),
            seen: local?.seen ?? [],
            envelope,
            pending: local?.pending || operations.length > 0,
          },
          operations,
        );
        set({
          doc: merged,
          keys,
          pending: local?.pending || operations.length > 0,
          conflicts: merged.conflicts.length,
        });
      }),
    );
  },
}));
function demoDocument(): Document {
  const doc = emptyDocument();
  const date = new Date();
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const oldMonth = new Date(date.getFullYear(), date.getMonth() - 5, 1)
    .toISOString()
    .slice(0, 7);
  const add = (id: string, kind: Entity["kind"], data: Record<string, any>) =>
    doc.entities.push({
      id,
      kind,
      data,
      vector: { demo: 1 },
      updatedAt: new Date().toISOString(),
    });
  add("bank", "account", {
    name: "Conta principal",
    institution: "Banco digital",
    balance: 12500,
    date: oldMonth + "-01",
  });
  add("wallet", "account", {
    name: "Carteira",
    institution: "Dinheiro",
    balance: 250,
    date: oldMonth + "-01",
  });
  for (let m = -5; m <= 0; m++) {
    const d = new Date(date.getFullYear(), date.getMonth() + m, 1);
    const mm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    add("salary" + m, "transaction", {
      description: "Salário",
      amount: 7800,
      type: "income",
      date: mm + "-01",
      category: "Salário",
      accountId: "bank",
      payment: "pix",
      status: "confirmed",
    });
    for (const [i, name, category, amount] of [
      [0, "Aluguel", "Moradia", 1850],
      [1, "Supermercado", "Mercado", 645],
      [2, "Cafés e restaurantes", "Alimentação", 480],
      [3, "Mobilidade", "Transporte", 240],
      [4, "Cinema e passeios", "Lazer", 160],
    ] as const)
      add(`expense${m}${i}`, "transaction", {
        description: name,
        amount: amount + Math.abs(m) * 15,
        type: "expense",
        date: mm + "-02",
        category,
        accountId: "bank",
        payment: "debit",
        status: "confirmed",
      });
    for (const [goalId, amount] of [
      ["goal", 500],
      ["goal2", 200],
      ["trip-demo", 100],
    ] as const)
      add(`demo-contribution-${goalId}-${m}`, "contribution", {
        goalId,
        amount,
        date: mm + "-" + String(Math.min(5, date.getDate())).padStart(2, "0"),
        description: "Reserva mensal",
        status: "confirmed",
        sourceId: "bank",
        streamId: "primary",
      });
  }
  add("rent-next", "transaction", {
    description: "Aluguel do próximo mês",
    amount: 1850,
    type: "expense",
    date: addMonth(month + "-05"),
    category: "Moradia",
    accountId: "bank",
    payment: "pix",
    status: "planned",
  });
  add("card", "card", {
    name: "Meu cartão",
    institution: "Banco digital",
    limit: 10000,
    closing: 3,
    due: 10,
  });
  add("goal", "goal", {
    name: "Reserva de emergência",
    target: 30000,
    saved: 15000,
    deadline: `${date.getFullYear() + 1}-12-01`,
    priority: 3,
    plan: {
      mode: "monthly",
      monthly: 500,
      months: 12,
      firstDate: oldMonth + "-05",
      deadline: `${date.getFullYear() + 1}-12-01`,
      effective: oldMonth + "-01",
      extras: [],
    },
  });
  add("goal2", "goal", {
    name: "Próxima viagem",
    target: 15000,
    saved: 3000,
    deadline: `${date.getFullYear() + 1}-07-01`,
    priority: 2,
    plan: {
      mode: "monthly",
      monthly: 250,
      months: 12,
      firstDate: oldMonth + "-05",
      deadline: `${date.getFullYear() + 1}-07-01`,
      effective: oldMonth + "-01",
      extras: [],
    },
  });
  add("trip-demo", "trip", {
    name: "Um novo destino",
    country: "Brasil",
    start: addMonths(month + "-20", 6),
    end: addMonths(month + "-24", 6),
    people: 1,
    currency: "BRL",
    exchange: 1,
    flights: 1000,
    hotel: 250,
    food: 80,
    transport: 40,
    tours: 300,
    insurance: 100,
    shopping: 200,
    other: 200,
    margin: 10,
    saved: 600,
    scenario: "standard",
    plan: {
      mode: "date",
      monthly: 400,
      months: 6,
      firstDate: oldMonth + "-05",
      deadline: addMonths(month + "-20", 6),
      effective: oldMonth + "-01",
      extras: [],
    },
  });
  add("asset", "asset", {
    name: "Tesouro e CDB",
    type: "fixed",
    amount: 22500,
    date: oldMonth + "-01",
  });
  add("budget", "budget", { category: "Alimentação", limit: 800 });
  return doc;
}
function addMonth(d: string) {
  const date = new Date(d + "T12:00:00");
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}
