import { useState } from "react";
import { AccountSettings } from "./AccountSettings";
import { isNative } from "../services/platform";
import {
  ShieldCheck,
  Cloud,
  Download,
  Upload,
  KeyRound,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useFinance } from "../core/store";
import * as google from "../core/google";
import { envelopeSchema, type Envelope } from "../core/crypto";
import { Modal, DataForm, download } from "../components/ui";
export function Settings() {
  const s = useFinance();
  const [restore, setRestore] = useState<Envelope | null>(null),
    [useRecovery, setUseRecovery] = useState(false),
    [client, setClient] = useState(google.clientId()),
    [timeout, setTimeoutValue] = useState(
      localStorage.getItem("f5-lock-minutes") || "10",
    ),
    [error, setError] = useState("");
  async function reconnect() {
    setError("");
    try {
      if (!google.authorized()) await google.login();
      await google.uploadSnapshot(await s.backup());
      localStorage.setItem(
        `myhorizon-drive-backup-${s.owner}`,
        new Date().toISOString(),
      );
      s.message("Backup criptografado salvo no Google Drive.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="settings-grid">
        <section className="panel">
          <span className="tile-icon">
            <ShieldCheck size={23} />
          </span>
          <h3>Seu cofre, sua privacidade</h3>
          <p className="muted">
            AES-256-GCM com derivação PBKDF2-SHA-256 de 600.000 iterações. Sua
            senha e as chaves ficam somente na memória durante a sessão.
          </p>
          <div className="setting-row">
            <div>
              <strong>Bloqueio por inatividade</strong>
              <p className="muted">Exige desbloqueio para retomar a sessão.</p>
            </div>
            <select
              aria-label="Tempo de bloqueio"
              value={timeout}
              onChange={(e) => {
                setTimeoutValue(e.target.value);
                localStorage.setItem("f5-lock-minutes", e.target.value);
                window.dispatchEvent(new Event("f5-lock-setting"));
              }}
            >
              {[1, 5, 10, 15, 30].map((v) => (
                <option value={v} key={v}>
                  {v} minuto(s)
                </option>
              ))}
            </select>
          </div>
          <button className="btn" onClick={s.lock}>
            <KeyRound size={16} />
            Bloquear agora
          </button>
          <div className="info-box">
            A senha-mestra e a chave de recuperação são equivalentes para abrir
            o cofre. Sem ambas, os dados não podem ser recuperados. Baixe também
            backups regularmente.
          </div>
        </section>
        <AccountSettings />
        <section className="panel">
          <span className="tile-icon">
            <Cloud size={23} />
          </span>
          <h3>Backup opcional no Google Drive</h3>
          <p className="muted">
            Uma cópia criptografada para recuperação. O Drive não participa da
            sincronização entre dispositivos.
          </p>
          {isNative() ? (
            <p className="info-box">
              O backup no Drive está disponível na versão web. No aplicativo,
              exporte seu backup criptografado em arquivo.
            </p>
          ) : (
            <>
              <button
                className="btn"
                disabled={s.demo || !navigator.onLine}
                onClick={reconnect}
              >
                <Cloud size={16} />
                Salvar backup no Drive
              </button>
              <p className="muted">
                Acesso somente aos arquivos do aplicativo, com o escopo{" "}
                <code>drive.file</code>. A autorização do Drive é separada do
                login da conta.
              </p>
              <p className="muted">
                Último backup:{" "}
                {localStorage.getItem(`myhorizon-drive-backup-${s.owner}`)
                  ? new Date(
                      localStorage.getItem(
                        `myhorizon-drive-backup-${s.owner}`,
                      )!,
                    ).toLocaleString("pt-BR")
                  : "Ainda não realizado"}
              </p>
            </>
          )}
        </section>
        <section className="panel">
          <span className="tile-icon">
            <Download size={23} />
          </span>
          <h3>Backup e restauração</h3>
          <p className="muted">
            Exporte seu cofre criptografado. Restaurar mescla os registros por
            versão e mantém exclusões e conflitos.
          </p>
          <div className="button-row">
            <button
              className="btn primary"
              disabled={s.demo}
              onClick={async () => {
                try {
                  const saved = await download(
                    JSON.stringify(await s.backup()),
                    `my-horizon-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  );
                  if (saved) s.message("Backup criptografado exportado.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Exportar backup
            </button>
            <label className={`btn ${s.demo ? "disabled" : ""}`}>
              <Upload size={16} />
              Restaurar backup
              <input
                disabled={s.demo}
                type="file"
                hidden
                accept=".json"
                onChange={async (e) => {
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 30 * 1024 * 1024)
                      throw Error("Backup acima de 30 MB.");
                    setRestore(
                      envelopeSchema.parse(JSON.parse(await file.text())),
                    );
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          <p className="muted">
            O backup não contém senha ou chave em texto puro. Exportações CSV e
            relatórios PDF contêm dados legíveis; escolha onde guardá-los.
          </p>
        </section>
        <section className="panel">
          <span className="tile-icon">
            <ExternalLink size={23} />
          </span>
          <h3>Acesso opcional ao Drive na web</h3>
          <label>
            Client ID OAuth público
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (!client.endsWith(".apps.googleusercontent.com")) {
                setError("Client ID inválido.");
                return;
              }
              localStorage.setItem("f5-google-client", client.trim());
              s.message("Client ID atualizado. Reconecte sua conta Google.");
            }}
          >
            Salvar Client ID
          </button>
          <p className="muted">Origem deste aplicativo:</p>
          <code className="code-block">{location.origin}</code>
          <p className="muted">
            Adicione esta origem nas origens JavaScript autorizadas no Google
            Cloud. Ative Drive API, configure consentimento e usuários de teste.
            Em produção use HTTPS e confirme domínio, política de privacidade e
            status da tela de consentimento.
          </p>
          <a
            className="text-btn"
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
          >
            Abrir credenciais Google
            <ExternalLink size={14} />
          </a>
        </section>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {s.error && (
        <p role="alert" className="error-box">
          {s.error}
        </p>
      )}
      {s.doc!.conflicts.length > 0 && (
        <section className="panel">
          <h3>
            <AlertTriangle size={18} />
            Revisar edições concorrentes
          </h3>
          <p className="muted">
            Os valores atuais usam a versão local até sua escolha. Revise cada
            diferença antes de usar os indicadores para tomar decisões.
          </p>
          {s.doc!.conflicts.map((c) => (
            <div className="conflict" key={c.id}>
              <h4>
                {c.local.data.description ??
                  c.local.data.name ??
                  c.local.data.category ??
                  c.id}
              </h4>
              <div className="conflict-versions">
                {[
                  ["Versão neste dispositivo", c.local],
                  ["Versão de outro dispositivo", c.remote],
                ].map(([label, entity]) => {
                  const e = entity as typeof c.local;
                  return (
                    <div key={String(label)}>
                      <strong>{String(label)}</strong>
                      <small>
                        {new Date(e.updatedAt).toLocaleString("pt-BR")}{" "}
                        {e.deleted ? "· Excluído" : ""}
                      </small>
                      <pre>{JSON.stringify(e.data, null, 2)}</pre>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            await s.edit([
                              {
                                id: e.id,
                                kind: e.kind,
                                data: e.data,
                                deleted: e.deleted,
                              },
                            ]);
                            s.message(
                              "Conflito resolvido. A resolução será sincronizada.",
                            );
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        Manter esta versão
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
      {restore && (
        <Modal
          title="Restaurar backup criptografado"
          onClose={() => setRestore(null)}
        >
          <p className="muted">
            Informe a senha ou chave de recuperação usada no backup. Os dados
            serão mesclados com seu cofre atual.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={useRecovery}
              onChange={(e) => setUseRecovery(e.target.checked)}
            />
            Usar chave de recuperação
          </label>
          <DataForm
            fields={[
              {
                key: "password",
                label: useRecovery ? "Chave de recuperação" : "Senha do backup",
                type: "password",
                required: true,
              },
            ]}
            onSubmit={async (d) => {
              await s.restore(restore, d.password, useRecovery);
              setRestore(null);
              s.message(
                "Backup mesclado com sucesso. Revise eventuais conflitos.",
              );
            }}
            submit="Restaurar e mesclar"
          />
        </Modal>
      )}
    </>
  );
}
