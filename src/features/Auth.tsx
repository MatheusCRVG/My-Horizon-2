import { useEffect, useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Check,
  Settings2,
  WifiOff,
  LoaderCircle,
} from "lucide-react";
import { db } from "../core/db";
import * as google from "../core/google";
import { envelopeSchema, type Envelope } from "../core/crypto";
import { useFinance } from "../core/store";
import { DataForm, Modal, download } from "../components/ui";
import { BRAND } from "../core/brand";
import "../auth-refinement.css";
export function Auth() {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [configure, setConfigure] = useState(false),
    [envelope, setEnvelope] = useState<Envelope | null>(null),
    [owner, setOwner] = useState(""),
    [ready, setReady] = useState(false),
    [useRecovery, setUseRecovery] = useState(false),
    [local, setLocal] = useState<Envelope[]>([]),
    [previewAvailable, setPreviewAvailable] = useState(true);
  const store = useFinance();
  useEffect(() => {
    db.vaults
      .toArray()
      .then((v) => setLocal(v.map((r) => r.envelope)))
      .catch(() =>
        setError(
          "Não foi possível abrir o armazenamento local. Habilite IndexedDB no navegador.",
        ),
      );
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const p = await google.login();
      setOwner(p.sub);
      const local = await db.vaults.get(p.sub);
      if (local) {
        setEnvelope(local.envelope);
        setReady(true);
      } else {
        const snapshots = await google.snapshots();
        if (snapshots.length) {
          const e = envelopeSchema.parse(
            await google.downloadSnapshot(snapshots[0].id),
          );
          if (e.owner !== p.sub)
            throw Error("O cofre do Drive não pertence à conta conectada.");
          setEnvelope(e);
        } else setEnvelope(null);
        setReady(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout auth-refined">
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
          <p>
            Seu dinheiro, seus planos e o que você quer conquistar. Tudo em
            perspectiva.
          </p>
          {previewAvailable && (
            <figure className="auth-product-preview">
              <img
                src="/previews/horizons-demo.png"
                alt="Prévia ilustrativa do My Horizon+: horizontes com fotografias, valores de exemplo e barras de progresso."
                width="1248"
                height="660"
                loading="lazy"
                decoding="async"
                onError={() => setPreviewAvailable(false)}
              />
              <figcaption>
                Uma prévia do aplicativo · demonstração com dados fictícios
              </figcaption>
            </figure>
          )}
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
            {ready
              ? envelope
                ? "Desbloqueie seu cofre"
                : "Crie seu espaço"
              : "Seu próximo horizonte começa aqui."}
          </h2>
          <p>
            {ready
              ? envelope
                ? "Use sua senha-mestra para acessar seu planejamento."
                : "Defina uma senha-mestra para seu cofre. Depois, guarde sua chave de recuperação."
              : "Entre com sua conta Google para cuidar do presente e planejar o que vem depois."}
          </p>
          {!ready ? (
            <>
              <button
                className="btn google"
                onClick={connect}
                disabled={busy || !navigator.onLine}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={20} aria-hidden="true" />
                ) : (
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
                )}
                <span aria-live="polite">
                  {busy ? "Conectando…" : "Continuar com Google"}
                </span>
                <ArrowRight size={18} />
              </button>
              {local.length > 0 && (
                <div className="offline-box">
                  <WifiOff size={18} />
                  <div>
                    <strong>Cofre disponível neste dispositivo</strong>
                    <p>Desbloqueie para trabalhar offline.</p>
                    {local.map((e, i) => (
                      <button
                        className="text-btn"
                        key={e.owner}
                        onClick={() => {
                          setEnvelope(e);
                          setOwner(e.owner);
                          setReady(true);
                        }}
                      >
                        Desbloquear cofre {local.length > 1 ? i + 1 : ""}
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="auth-demo-separator">
                <span>ou conheça antes de entrar</span>
              </div>
              <button
                className="btn demo-btn"
                disabled={busy}
                onClick={() => store.demoStart()}
              >
                Explorar com dados fictícios
                <ArrowRight size={17} />
              </button>
              <small className="auth-note">
                Explore à vontade. Os dados são fictícios e as alterações são
                temporárias.
              </small>
              <details className="auth-access-help">
                <summary>Precisa de ajuda para entrar?</summary>
                <p>
                  A configuração avançada é necessária apenas se o acesso Google
                  ainda não estiver configurado para este endereço.
                </p>
                <button className="text-btn" onClick={() => setConfigure(true)}>
                  <Settings2 size={15} />
                  Configurar acesso Google
                </button>
              </details>
              {!navigator.onLine && (
                <p className="auth-inline-notice" role="status">
                  <WifiOff size={16} />
                  Você está sem conexão. Use um cofre deste dispositivo, quando
                  disponível, ou explore a demonstração.
                </p>
              )}
            </>
          ) : (
            <>
              <DataForm
                key={`${owner}-${useRecovery}`}
                fields={[
                  {
                    key: "password",
                    label: useRecovery
                      ? "Chave de recuperação"
                      : "Senha-mestra",
                    type: "password",
                    required: true,
                    hint: envelope
                      ? "Sua senha nunca é enviada ao Google."
                      : "Use pelo menos 12 caracteres. Guarde sua chave de recuperação.",
                  },
                  ...(!envelope
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
                  envelope ? "Desbloquear cofre" : "Criar cofre criptografado"
                }
                onSubmit={async (d) => {
                  if (envelope) {
                    await store.open(envelope, d.password, useRecovery);
                    void store.sync();
                  } else {
                    if (d.password !== d.confirm)
                      throw Error("As senhas não coincidem.");
                    await store.create(d.password, owner);
                  }
                }}
              />
              {envelope && (
                <button
                  className="text-btn"
                  onClick={() => setUseRecovery(!useRecovery)}
                >
                  {useRecovery
                    ? "Usar senha-mestra"
                    : "Usar chave de recuperação"}
                </button>
              )}
              <label className="text-btn">
                Restaurar backup criptografado
                <input
                  hidden
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const backup = envelopeSchema.parse(
                        JSON.parse(await file.text()),
                      );
                      if (backup.owner !== owner)
                        throw Error("Backup pertence a outra conta.");
                      if (envelope && envelope.vaultId !== backup.vaultId)
                        throw Error("Já existe outro cofre neste dispositivo.");
                      setEnvelope(backup);
                      setError("");
                      setNotice(
                        "Backup carregado. Informe a senha do backup para desbloquear.",
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
              <button
                className="text-btn"
                onClick={() => {
                  setReady(false);
                  setUseRecovery(false);
                  setError("");
                  setNotice("");
                }}
              >
                Voltar
              </button>
            </>
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
        <div className="auth-bottom">
          {BRAND.name} ·{" "}
          <a href="/privacidade.html" target="_blank" rel="noreferrer">
            Privacidade
          </a>
        </div>
      </section>
      {configure && (
        <Modal title="Conectar ao Google" onClose={() => setConfigure(false)}>
          <p className="muted">
            Cadastre um aplicativo Web no Google Cloud, ative a Drive API e
            adicione esta origem nas origens JavaScript autorizadas:
          </p>
          <code className="code-block">{location.origin}</code>
          <p className="muted">
            Configure a tela de consentimento com seu e-mail de teste e os
            escopos openid, email, profile e drive.file. O aplicativo usa o
            fluxo oficial do Google Identity Services.
          </p>
          <DataForm
            fields={[
              {
                key: "client",
                label: "Client ID público",
                required: true,
                default: google.clientId(),
                hint: "Termina em .apps.googleusercontent.com. Não informe client_secret.",
              },
            ]}
            onSubmit={async (d) => {
              if (!d.client.endsWith(".apps.googleusercontent.com"))
                throw Error("Client ID inválido.");
              localStorage.setItem("f5-google-client", d.client.trim());
              setConfigure(false);
            }}
            submit="Salvar configuração"
          />
          <a
            className="text-btn"
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
          >
            Abrir Google Cloud
            <ArrowRight size={15} />
          </a>
        </Modal>
      )}
    </div>
  );
}
export function RecoveryModal({
  recovery,
  done,
}: {
  recovery: string;
  done: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      title="Guarde sua chave de recuperação"
      onClose={() => {
        if (saved) done();
      }}
    >
      <p>
        Esta chave desbloqueia seu cofre se você perder a senha. Guarde em um
        lugar seguro, fora deste dispositivo.
      </p>
      <code className="code-block recovery-key">{recovery}</code>
      <button
        className="btn"
        onClick={async () => {
          try {
            if (await download(recovery, "my-horizon-chave-recuperacao.txt", "text/plain")) setSaved(true);
          } catch { useFinance.getState().message("Não foi possível salvar a chave. Guarde o código em um lugar seguro e confirme abaixo."); }
        }}
      >
        <ShieldCheck size={17} />
        Baixar chave
      </button>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        Guardei minha chave em um lugar seguro.
      </label>
      <p className="muted">
        Sem a senha e sem a chave, não há como recuperar os dados. O backup
        criptografado também exige uma delas.
      </p>
      <button className="btn primary" disabled={!saved} onClick={done}>
        <Check size={16} />
        Começar
      </button>
    </Modal>
  );
}
