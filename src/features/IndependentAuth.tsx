import { useEffect, useState } from "react";
import {
  ArrowRight,
  Cloud,
  KeyRound,
  LoaderCircle,
  Monitor,
  Settings2,
  ShieldCheck,
  Upload,
  WifiOff,
} from "lucide-react";
import { BRAND } from "../core/brand";
import { useFinance } from "../core/store";
import { emptyDocument } from "../core/model";
import {
  decryptDocument,
  encryptDocument,
  envelopeSchema,
  unlock,
  type Envelope,
  type VaultKeys,
} from "../core/crypto";
import { mergeDocuments } from "../core/merge";
import { repository, type VaultRecord } from "../services/storage/repository";
import { runExclusive } from "../services/storage/lock";
import { cloudConfig, saveCloudConfig } from "../services/config";
import * as auth from "../services/auth/client";
import { linkVault } from "../services/auth/link-vault";
import {
  createOperations,
  createRpcTransport,
  syncVault,
} from "../services/sync";
import { DataForm, Modal } from "../components/ui";
import "../auth-refinement.css";
import "../independent.css";

export function ServerSetup({ close }: { close: () => void }) {
  const config = cloudConfig();
  return (
    <Modal title="Conectar seu servidor" onClose={close}>
      <p className="muted">
        Use um projeto Supabase próprio com a migração do banco instalada. Aqui
        entram apenas a URL e a chave pública; nenhuma senha ou chave secreta.
      </p>
      <DataForm
        fields={[
          {
            key: "url",
            label: "URL do projeto Supabase",
            required: true,
            default: config?.url || "",
            hint: "https://seu-projeto.supabase.co",
          },
          {
            key: "key",
            label: "Chave pública publishable ou anon",
            required: true,
            default: config?.key || "",
          },
        ]}
        submit="Salvar e reiniciar"
        onSubmit={async (data) => {
          saveCloudConfig({ url: data.url, key: data.key });
          auth.forgetSession();
          location.assign("/");
        }}
      />
      <p className="muted">
        O código-fonte inclui o esquema, as regras de acesso e as instruções em
        docs/INDEPENDENCIA.md. O modo local funciona sem este servidor.
      </p>
    </Modal>
  );
}

export function AccountAccess({
  onAuthenticated,
}: {
  onAuthenticated: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const configured = !!cloudConfig();
  async function run(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-access">
      <div
        className="auth-account-tabs"
        role="group"
        aria-label="Acesso à conta"
      >
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
            setNotice("");
          }}
        >
          Entrar
        </button>
        <button
          className={mode === "signup" ? "active" : ""}
          onClick={() => {
            setMode("signup");
            setError("");
            setNotice("");
          }}
        >
          Criar conta
        </button>
      </div>
      {!configured && (
        <p className="auth-inline-notice">
          <Cloud size={16} /> A conta e a sincronização ficam disponíveis após
          conectar seu servidor. Você já pode usar um cofre local.
        </p>
      )}
      <form
        className="account-fields"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget),
            email = String(data.get("email")),
            password = String(data.get("password") || "");
          void run(async () => {
            if (mode === "forgot") {
              await auth.resetPassword(email);
              setNotice(
                "Se houver uma conta com esse e-mail, você receberá as instruções de recuperação. Abra o link neste dispositivo.",
              );
            } else if (mode === "signup") {
              if (password !== String(data.get("confirm")))
                throw Error("As senhas não coincidem.");
              const session = await auth.signUp(email, password);
              if (session) await onAuthenticated();
              else
                setNotice(
                  "Confira seu e-mail para confirmar o cadastro. Depois, entre na sua conta.",
                );
            } else {
              await auth.signIn(email, password);
              await onAuthenticated();
            }
          });
        }}
      >
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy}
          />
        </label>
        {mode !== "forgot" && (
          <label>
            Senha da conta
            <input
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 12 : 1}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              disabled={busy}
            />
          </label>
        )}
        {mode === "signup" && (
          <label>
            Confirme a senha da conta
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={busy}
            />
          </label>
        )}
        <button
          className="btn primary"
          disabled={busy || !configured || !navigator.onLine}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
          {mode === "signup"
            ? "Criar conta do My Horizon+"
            : mode === "forgot"
              ? "Enviar recuperação"
              : "Entrar na minha conta"}
        </button>
      </form>
      {mode === "login" && (
        <button
          className="text-btn"
          onClick={() => {
            setMode("forgot");
            setError("");
          }}
        >
          Esqueci a senha da conta
        </button>
      )}
      {mode !== "forgot" && (
        <button
          className="btn google"
          disabled={busy || !configured || !navigator.onLine}
          onClick={() => void run(auth.signInGoogle)}
        >
          <span className="auth-google-symbol" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path
                fill="#4285F4"
                d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.7 6.1-14.9Z"
              />
              <path
                fill="#34A853"
                d="M24 44c5.5 0 10.2-1.8 13.6-4.9L31 34a12.4 12.4 0 0 1-7 2c-5.3 0-9.7-3.6-11.3-8.4H5.9v5.2A20.5 20.5 0 0 0 24 44Z"
              />
              <path
                fill="#FBBC05"
                d="M12.7 27.6a12.3 12.3 0 0 1 0-7.2v-5.2H5.9a20 20 0 0 0 0 17.6l6.8-5.2Z"
              />
              <path
                fill="#EA4335"
                d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.6 19.6 0 0 0 24 4 20.5 20.5 0 0 0 5.9 15.2l6.8 5.2C14.3 15.6 18.7 12 24 12Z"
              />
            </svg>
          </span>
          Continuar com Google
          <ArrowRight size={18} />
        </button>
      )}
      {mode === "forgot" && (
        <button className="text-btn" onClick={() => setMode("login")}>
          Voltar para entrar
        </button>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth-inline-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

type Selection = {
  owner: string;
  envelope?: Envelope;
  header?: VaultKeys["header"];
  link?: boolean;
  localOnly?: boolean;
};
export function IndependentAuth() {
  const store = useFinance();
  const [local, setLocal] = useState<VaultRecord[]>([]),
    [selected, setSelected] = useState<Selection | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false);
  const [recovery, setRecovery] = useState(false),
    [preview, setPreview] = useState(true),
    [sessionTick, updateSession] = useState(0);
  useEffect(
    () => auth.authEvents.subscribe(() => updateSession((n) => n + 1)),
    [],
  );
  useEffect(() => {
    let active = true;
    void repository
      .list()
      .then((records) => {
        if (active) setLocal(records);
      })
      .catch(() =>
        setError(
          "Não foi possível abrir o armazenamento protegido deste dispositivo.",
        ),
      );
    return () => {
      active = false;
    };
  }, [sessionTick]);
  async function prepareAccount() {
    const session = auth.currentSession();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const records = await repository.list();
      const existing = records.find((r) => r.accountId === session.user.id);
      if (existing)
        setSelected({ owner: existing.owner, envelope: existing.envelope });
      else {
        const remote = await auth.remoteVault();
        const sameOwner =
          remote && records.find((r) => r.owner === remote.header.owner);
        if (
          sameOwner &&
          (sameOwner.envelope.vaultId !== remote!.header.vaultId ||
            (sameOwner.accountId && sameOwner.accountId !== session.user.id))
        )
          throw Error(
            "Já existe outro cofre local com esta identificação. Nenhum dado será substituído.",
          );
        setSelected(
          sameOwner
            ? {
                owner: sameOwner.owner,
                envelope: sameOwner.envelope,
                link: !sameOwner.accountId,
              }
            : remote
              ? { owner: remote.header.owner, header: remote.header }
              : { owner: session.user.id },
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // OAuth callbacks also arrive while the login form is on screen.
  useEffect(() => {
    if (auth.currentSession() && !auth.passwordRecovery() && !selected)
      void prepareAccount();
    // Only auth events should restart account discovery; resetting selection must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionTick]);
  const session = auth.currentSession();
  const reset = () => {
    setSelected(null);
    setRecovery(false);
    setError("");
  };
  return (
    <div className="auth-layout auth-refined independent-auth">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <img
          className="auth-brand"
          src={BRAND.darkLogo}
          alt={BRAND.wordmark}
          width="1032"
          height="510"
        />
        <div className="auth-story-content">
          <h1 id="auth-story-title">
            <span>Mais clareza hoje.</span>
            <span>
              Mais possibilidades <em>amanhã.</em>
            </span>
          </h1>
          <p>Seu dinheiro. Seus sonhos. Seu próximo horizonte.</p>
          {preview && (
            <figure className="auth-product-preview">
              <img
                src="/previews/horizons-demo.png"
                alt="Prévia do My Horizon+ com dados fictícios."
                width="1248"
                height="660"
                onError={() => setPreview(false)}
              />
              <figcaption>
                Uma prévia do aplicativo · demonstração com dados fictícios
              </figcaption>
            </figure>
          )}
          <div className="independent-promise">
            <ShieldCheck size={18} />
            <span>Seu cofre protegido. Seus planos disponíveis offline.</span>
          </div>
        </div>
      </section>
      <section className="auth-entry" aria-labelledby="auth-entry-title">
        <div className="auth-form">
          <img
            className="auth-mobile-brand"
            src={BRAND.logo}
            alt={BRAND.wordmark}
            width="1032"
            height="510"
          />
          <h2 id="auth-entry-title">
            {auth.passwordRecovery()
              ? "Uma nova senha para sua conta"
              : selected
                ? selected.envelope || selected.header
                  ? "Desbloqueie seu cofre"
                  : "Crie seu espaço"
                : "Seu próximo horizonte começa aqui."}
          </h2>
          <p>
            {selected
              ? "A senha-mestra protege os seus dados neste dispositivo e nos backups. Ela é diferente da senha da conta."
              : "Entre na sua conta ou abra seu cofre neste dispositivo."}
          </p>
          {auth.passwordRecovery() ? (
            <DataForm
              fields={[
                {
                  key: "password",
                  label: "Nova senha da conta",
                  type: "password",
                  required: true,
                },
                {
                  key: "confirm",
                  label: "Confirme a nova senha",
                  type: "password",
                  required: true,
                },
              ]}
              submit="Atualizar senha da conta"
              onSubmit={async (d) => {
                if (d.password !== d.confirm)
                  throw Error("As senhas não coincidem.");
                await auth.updatePassword(d.password);
                await prepareAccount();
              }}
            />
          ) : selected ? (
            <>
              {selected.localOnly && (
                <p className="auth-inline-notice">
                  <Monitor size={17} />
                  Modo local. A sincronização poderá ser conectada depois, sem
                  apagar este cofre.
                </p>
              )}
              <DataForm
                key={`${selected.owner}-${!!selected.envelope}-${recovery}`}
                fields={[
                  {
                    key: "password",
                    label: recovery ? "Chave de recuperação" : "Senha-mestra",
                    type: "password",
                    required: true,
                    hint:
                      selected.envelope || selected.header
                        ? "A senha-mestra não é enviada ao servidor."
                        : "Use pelo menos 12 caracteres e guarde a chave de recuperação.",
                  },
                  ...(!selected.envelope && !selected.header
                    ? [
                        {
                          key: "confirm",
                          label: "Confirme a senha",
                          type: "password" as const,
                          required: true,
                        },
                      ]
                    : []),
                ]}
                submit={
                  selected.envelope || selected.header
                    ? "Desbloquear cofre"
                    : "Criar cofre criptografado"
                }
                onSubmit={async (d) => {
                  if (selected.header) {
                    const keys = await unlock(
                      { ...selected.header, iv: "", cipher: "" },
                      d.password,
                      recovery,
                    );
                    const expectedAccount = session!.user.id;
                    const active = () =>
                      auth.currentSession()?.user.id === expectedAccount;
                    const result = await runExclusive(async () => {
                      const prior = await repository.get(selected.owner);
                      if (
                        prior &&
                        (prior.envelope.vaultId !== keys.header.vaultId ||
                          (prior.accountId &&
                            prior.accountId !== expectedAccount))
                      )
                        throw Error(
                          "Já existe outro cofre local. Nada foi substituído.",
                        );
                      const doc = prior
                        ? await decryptDocument(prior.envelope, keys)
                        : emptyDocument();
                      const envelope = await encryptDocument(doc, keys);
                      const operations =
                        prior &&
                        !prior.accountId &&
                        !(await repository.outbox(prior.owner)).length
                          ? await createOperations(
                              emptyDocument(),
                              doc,
                              keys,
                              prior.owner,
                            )
                          : [];
                      const record: VaultRecord = {
                        ...prior,
                        owner: selected.owner,
                        envelope,
                        device: prior?.device || crypto.randomUUID(),
                        seen: prior?.seen || [],
                        accountId: expectedAccount,
                        authorized: true,
                        cursor: prior?.cursor || 0,
                        pending: !!prior?.pending || operations.length > 0,
                      };
                      if (!active()) throw Error("A sessão foi encerrada.");
                      await repository.commit(record, operations);
                      const transport = createRpcTransport({
                        accountId: expectedAccount,
                        rpc: (name, args) => auth.client().rpc(name, args),
                        active,
                      });
                      return syncVault({
                        record,
                        keys,
                        doc,
                        repository,
                        transport,
                        active,
                      });
                    });
                    await store.open(
                      result.record.envelope,
                      d.password,
                      recovery,
                    );
                  } else if (selected.envelope) {
                    // Validate the association before exposing any account-bound local data.
                    const prior = await repository.get(selected.owner);
                    if (
                      prior?.accountId &&
                      session &&
                      prior.accountId !== session.user.id
                    )
                      throw Error("Este cofre pertence a outra conta.");
                    if (selected.link) {
                      const remote = await auth.remoteVault();
                      if (
                        remote &&
                        remote.header.vaultId !== selected.envelope.vaultId
                      )
                        throw Error(
                          "A conta já possui outro cofre. Nenhum histórico será substituído.",
                        );
                      const keys = await unlock(
                        selected.envelope,
                        d.password,
                        recovery,
                      );
                      const imported = await decryptDocument(
                        selected.envelope,
                        keys,
                      );
                      const doc = await runExclusive(async () => {
                        const latest = await repository.get(selected.owner);
                        if (
                          latest?.accountId &&
                          latest.accountId !== session!.user.id
                        )
                          throw Error("O cofre pertence a outra conta.");
                        const merged = latest
                          ? mergeDocuments(
                              imported,
                              await decryptDocument(latest.envelope, keys),
                            )
                          : imported;
                        const envelope = await encryptDocument(merged, keys);
                        const operations = await createOperations(
                          emptyDocument(),
                          merged,
                          keys,
                          selected.owner,
                        );
                        await repository.commit(
                          {
                            ...latest,
                            owner: selected.owner,
                            envelope,
                            device: latest?.device || crypto.randomUUID(),
                            seen: latest?.seen || [],
                            pending: true,
                          },
                          operations,
                        );
                        return merged;
                      });
                      await linkVault(keys, doc);
                    }
                    await store.open(selected.envelope, d.password, recovery);
                  } else {
                    if (d.password !== d.confirm)
                      throw Error("As senhas não coincidem.");
                    await store.create(d.password, selected.owner);
                  }
                  void useFinance.getState().sync();
                }}
              />
              {(selected.envelope || selected.header) && (
                <button
                  className="text-btn"
                  onClick={() => setRecovery(!recovery)}
                >
                  <KeyRound size={15} />
                  {recovery ? "Usar senha-mestra" : "Usar chave de recuperação"}
                </button>
              )}
              {!selected.header && (
                <label className="text-btn import-vault">
                  <Upload size={15} />
                  Trazer meu backup criptografado
                  <input
                    type="file"
                    hidden
                    accept=".json,application/json"
                    onChange={async (e) => {
                      try {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 30 * 1024 * 1024)
                          throw Error("Backup acima de 30 MB.");
                        const envelope = envelopeSchema.parse(
                          JSON.parse(await file.text()),
                        );
                        const previous = await repository.get(envelope.owner);
                        if (
                          previous?.accountId &&
                          previous.accountId !== session?.user.id
                        )
                          throw Error(
                            "Este backup já está associado a outra conta neste dispositivo.",
                          );
                        if (
                          selected.envelope &&
                          selected.envelope.vaultId !== envelope.vaultId
                        )
                          throw Error(
                            "Já existe outro cofre selecionado. Volte antes de importar.",
                          );
                        setSelected({
                          owner: envelope.owner,
                          envelope,
                          link: !!session && !selected.localOnly,
                          localOnly: selected.localOnly || !session,
                        });
                        setError("");
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              )}
              {session &&
                !selected.envelope &&
                !selected.header &&
                local
                  .filter((r) => !r.accountId)
                  .map((r, i) => (
                    <button
                      className="text-btn"
                      key={r.owner}
                      onClick={() =>
                        setSelected({
                          owner: r.owner,
                          envelope: r.envelope,
                          link: true,
                        })
                      }
                    >
                      Conectar meu cofre local {local.length > 1 ? i + 1 : ""}
                      <ArrowRight size={15} />
                    </button>
                  ))}
              <button className="text-btn" onClick={reset}>
                Voltar
              </button>
            </>
          ) : (
            <>
              <AccountAccess onAuthenticated={prepareAccount} />
              {busy && (
                <p className="auth-inline-notice" role="status">
                  <LoaderCircle className="spin" size={17} />
                  Consultando seu cofre…
                </p>
              )}
              {local.filter((r) => r.authorized !== false).length > 0 && (
                <div className="offline-box">
                  <WifiOff size={18} />
                  <div>
                    <strong>Cofres neste dispositivo</strong>
                    <p>Abra com a senha-mestra, mesmo sem conexão.</p>
                    {local
                      .filter((r) => r.authorized !== false)
                      .map((r, i) => (
                        <button
                          className="text-btn"
                          key={r.owner}
                          onClick={() => {
                            setSelected({
                              owner: r.owner,
                              envelope: r.envelope,
                            });
                            setError("");
                          }}
                        >
                          Desbloquear cofre {local.length > 1 ? i + 1 : ""}
                          <ArrowRight size={15} />
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <button
                className="btn local-vault-button"
                onClick={() =>
                  setSelected({ owner: crypto.randomUUID(), localOnly: true })
                }
              >
                <Monitor size={18} />
                Usar somente neste dispositivo
              </button>
              <div className="auth-demo-separator">
                <span>ou conheça antes de entrar</span>
              </div>
              <button
                className="btn demo-btn"
                onClick={() => store.demoStart()}
              >
                Explorar com dados fictícios
                <ArrowRight size={17} />
              </button>
              <small className="auth-note">
                A demonstração é temporária. Nenhum dado fictício é salvo no seu
                cofre.
              </small>
              <details className="auth-access-help">
                <summary>Configurar conexão e migração</summary>
                <p>
                  Seu servidor pode ser conectado depois. Para preservar os
                  dados do aplicativo anterior, exporte o backup criptografado e
                  importe em seu cofre.
                </p>
                <button className="text-btn" onClick={() => setSetup(true)}>
                  <Settings2 size={15} />
                  Conectar servidor do My Horizon+
                </button>
              </details>
            </>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {store.notice && (
            <p className="auth-inline-notice" role="status">
              {store.notice}
            </p>
          )}
        </div>
        <div className="auth-bottom">
          {BRAND.name} ·{" "}
          <a href="/privacidade.html" target="_blank" rel="noreferrer">
            Privacidade
          </a>
        </div>
      </section>
      {setup && <ServerSetup close={() => setSetup(false)} />}
    </div>
  );
}
