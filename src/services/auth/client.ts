import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { cloudConfig } from "../config";
import { isNative, openExternal } from "../platform";
import type { Envelope, VaultKeys } from "../../core/crypto";
import { repository, type VaultRecord } from "../storage/repository";
import { runExclusive } from "../storage/lock";
import { sealSession, unsealSession } from "./session-crypto";
let instance: SupabaseClient | null = null;
let verifiedSession: Session | null = null;
let sessionKeys: VaultKeys | null = null;
let authGeneration = 0;
const listeners = new Set<() => void>();
let recovery = false;
const volatile = new Map<string, string>();
const verifierKey = "myhorizon-pkce-verifier-v1";
const notify = () => listeners.forEach((fn) => fn());
export const authEvents = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
export const currentSession = () => verifiedSession;
export const passwordRecovery = () => recovery;
export function client() {
  if (instance) return instance;
  const config = cloudConfig();
  if (!config)
    throw Error(
      "Configure o servidor do My Horizon+ para entrar na conta e sincronizar.",
    );
  const generation = authGeneration;
  instance = createClient(config.url, config.key, {
    global: {
      fetch: async (input, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const cancel = () => controller.abort();
        init?.signal?.addEventListener("abort", cancel, { once: true });
        if (init?.signal?.aborted) controller.abort();
        try {
          return await fetch(input, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
          init?.signal?.removeEventListener("abort", cancel);
        }
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage: {
        getItem: (key) =>
          key.endsWith("-code-verifier")
            ? localStorage.getItem(verifierKey)
            : (volatile.get(key) ?? null),
        setItem: (key, value) => {
          if (key.endsWith("-code-verifier"))
            localStorage.setItem(verifierKey, value);
          else volatile.set(key, value);
        },
        removeItem: (key) => {
          if (key.endsWith("-code-verifier"))
            localStorage.removeItem(verifierKey);
          else volatile.delete(key);
        },
      },
    },
  });
  instance.auth.onAuthStateChange((event, session) => {
    if (generation !== authGeneration) return;
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (event === "TOKEN_REFRESHED" && session && sessionKeys) {
      verifiedSession = session;
      const keys = sessionKeys;
      setTimeout(() => {
        if (generation === authGeneration)
          void rememberSession(keys).catch(() => {});
      }, 0);
    }
    if (event === "SIGNED_OUT") {
      verifiedSession = null;
      sessionKeys = null;
    }
    notify();
  });
  return instance;
}
export async function validateSession(
  session: Session,
  generation = authGeneration,
) {
  const { data, error } = await client().auth.getUser(session.access_token);
  if (error || !data.user || data.user.id !== session.user.id)
    throw Error("Não foi possível validar sua conta. Entre novamente.");
  if (generation !== authGeneration)
    throw Error("A sessão foi encerrada. Entre novamente.");
  verifiedSession = { ...session, user: data.user };
  notify();
  return verifiedSession;
}
export async function signIn(email: string, password: string) {
  const generation = authGeneration;
  const { data, error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error)
    throw Error(
      "Não foi possível entrar. Confira seu e-mail, senha e confirmação de cadastro.",
    );
  return validateSession(data.session, generation);
}
const callbackUrl = () =>
  isNative() ? "myhorizon://auth/callback" : `${location.origin}/auth/callback`;
export async function signUp(email: string, password: string) {
  const generation = authGeneration;
  if (password.length < 12)
    throw Error("Use pelo menos 12 caracteres na senha da conta.");
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error)
    throw Error(
      "Não foi possível cadastrar a conta. Confira os dados ou tente novamente mais tarde.",
    );
  return data.session ? validateSession(data.session, generation) : null;
}
export async function signInGoogle() {
  const { data, error } = await client().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(), skipBrowserRedirect: true },
  });
  if (error || !data.url)
    throw Error("Não foi possível abrir o acesso Google.");
  await openExternal(data.url);
}
export async function resetPassword(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: callbackUrl(),
  });
  if (error) throw Error("Não foi possível solicitar a recuperação agora.");
}
export async function updatePassword(password: string) {
  if (password.length < 12) throw Error("Use pelo menos 12 caracteres.");
  const { error } = await client().auth.updateUser({ password });
  if (error)
    throw Error(
      "Não foi possível alterar a senha. Solicite um novo link de recuperação.",
    );
  recovery = false;
  const { data } = await client().auth.getSession();
  if (data.session) await validateSession(data.session);
}
const handled = new Set<string>();
export async function handleAuthUrl(value: string) {
  const generation = authGeneration;
  const url = new URL(value);
  const allowed = isNative()
    ? url.protocol === "myhorizon:" &&
      url.hostname === "auth" &&
      url.pathname === "/callback"
    : url.origin === location.origin && url.pathname === "/auth/callback";
  if (!allowed) return;
  const code = url.searchParams.get("code");
  if (!code || handled.has(code)) return;
  handled.add(code);
  const { data, error } = await client().auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    handled.delete(code);
    throw Error(
      "O link expirou ou pertence a outro dispositivo. Solicite um novo link neste aplicativo.",
    );
  }
  await validateSession(data.session, generation);
  if (!isNative()) history.replaceState(null, "", "/");
}
export async function listenAuthUrls(onError: (message: string) => void) {
  if (!isNative()) {
    await handleAuthUrl(location.href).catch((e) => onError(e.message));
    return () => {};
  }
  const { getCurrent, onOpenUrl } =
    await import("@tauri-apps/plugin-deep-link");
  const handle = (urls: string[]) => {
    for (const url of urls)
      void handleAuthUrl(url).catch((e) => onError(e.message));
  };
  handle((await getCurrent()) || []);
  return onOpenUrl(handle);
}
export async function rememberSession(keys: VaultKeys) {
  const generation = authGeneration;
  const session = verifiedSession;
  if (!session) return;
  sessionKeys = keys;
  const sealed = await sealSession(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      userId: session.user.id,
    },
    keys,
  );
  await runExclusive(async () => {
    const record = await repository.get(keys.header.owner);
    if (!record || sessionKeys !== keys || generation !== authGeneration)
      return;
    if (record.accountId && record.accountId !== session.user.id)
      throw Error("A conta não corresponde ao cofre.");
    await repository.put({
      ...record,
      accountId: session.user.id,
      session: sealed,
      authorized: true,
    });
  });
}
export async function resumeSession(record: VaultRecord, keys: VaultKeys) {
  const generation = authGeneration;
  if (!record.session || !record.accountId || !navigator.onLine) return;
  const stored = await unsealSession<{
    access_token: string;
    refresh_token: string;
    userId: string;
  }>(record.session, keys);
  if (stored.userId !== record.accountId)
    throw Error("A sessão armazenada pertence a outra conta.");
  const { data, error } = await client().auth.setSession(stored);
  if (error || !data.session)
    throw Error(
      "Entre novamente para sincronizar. Seus dados locais estão preservados.",
    );
  const session = await validateSession(data.session, generation);
  if (session.user.id !== record.accountId)
    throw Error("Conta diferente do cofre local.");
  await rememberSession(keys);
}
export function forgetSession() {
  authGeneration++;
  sessionKeys = null;
  verifiedSession = null;
  instance?.auth.stopAutoRefresh();
  instance = null;
  recovery = false;
  volatile.clear();
  notify();
}
export async function signOut(owner: string) {
  const previous = instance;
  // Invalidate refresh callbacks before waiting for the same write lock.
  forgetSession();
  await runExclusive(async () => {
    const record = await repository.get(owner);
    if (record)
      await repository.put({
        ...record,
        session: undefined,
        authorized: false,
      });
  });
  notify();
  if (previous && navigator.onLine)
    void previous.auth.signOut({ scope: "local" }).catch(() => {});
}
export async function remoteVault(): Promise<{
  header: Omit<Envelope, "iv" | "cipher">;
  vault_id: string;
} | null> {
  if (!verifiedSession)
    throw Error("Entre na conta para consultar seus dispositivos.");
  const { data, error } = await client().rpc("horizon_bootstrap");
  if (error)
    throw Error(
      "Não foi possível consultar o cofre. Confira a conexão e a instalação do banco.",
    );
  return data
    ? { header: data.header ?? data, vault_id: data.vault_id ?? data.vaultId }
    : null;
}
