import { useEffect, useState } from "react";
import { Cloud, LogOut, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useFinance } from "../core/store";
import { AccountAccess, ServerSetup } from "./IndependentAuth";
import { cloudConfig } from "../services/config";
import { repository } from "../services/storage/repository";
import * as auth from "../services/auth/client";
import { linkVault } from "../services/auth/link-vault";
import { isNative } from "../services/platform";

export function AccountSettings() {
  const s = useFinance();
  const [setup, setSetup] = useState(false),
    [login, setLogin] = useState(false);
  const [linked, setLinked] = useState(false),
    [error, setError] = useState("");
  const [, updateSession] = useState(0);
  useEffect(
    () => auth.authEvents.subscribe(() => updateSession((n) => n + 1)),
    [],
  );
  useEffect(() => {
    void repository.get(s.owner).then((r) => setLinked(!!r?.accountId));
  }, [s.owner, s.lastSync]);
  async function connect() {
    try {
      if (!s.keys || !s.doc) throw Error("Desbloqueie seu cofre real.");
      await linkVault(s.keys, s.doc);
      setLinked(true);
      setLogin(false);
      setError("");
      s.message("Cofre conectado à sua conta. O histórico foi preservado.");
      await s.sync();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel account-status">
      <span className="tile-icon">
        <Cloud size={23} />
      </span>
      <div>
        <h3>Sua conta e seus dispositivos</h3>
        <p className="muted">
          {linked
            ? "Sincronização incremental com seu servidor. Os dados financeiros permanecem cifrados."
            : "Seu cofre está neste dispositivo. Conecte uma conta para usar o mesmo planejamento no computador e no celular."}
        </p>
      </div>
      <div className="sync-details">
        <span>Armazenamento local</span>
        <strong>
          {isNative()
            ? "SQLite · dados cifrados"
            : "IndexedDB · dados cifrados"}
        </strong>
        <span>Servidor</span>
        <strong>{cloudConfig() ? "Configurado" : "Ainda não conectado"}</strong>
        <span>Última sincronização concluída</span>
        <strong>
          {s.lastSync
            ? new Date(s.lastSync).toLocaleString("pt-BR")
            : "Ainda não realizada"}
        </strong>
        <span>Conflitos para revisar</span>
        <strong>{s.conflicts}</strong>
      </div>
      <div className="button-row">
        <button
          className="btn"
          onClick={() => setSetup(true)}
          disabled={s.demo || linked}
        >
          <Server size={16} />
          {cloudConfig() ? "Configuração do servidor" : "Conectar servidor"}
        </button>
        {cloudConfig() && (
          <button
            className="btn"
            disabled={s.demo}
            onClick={() => setLogin(!login)}
          >
            <ShieldCheck size={16} />
            {login
              ? "Fechar acesso"
              : linked
                ? "Entrar novamente"
                : "Conectar minha conta"}
          </button>
        )}
        {linked && (
          <button
            className="btn primary"
            disabled={s.demo || s.syncing || !navigator.onLine}
            onClick={() => void s.sync()}
          >
            <RefreshCw size={16} />
            Sincronizar agora
          </button>
        )}
      </div>
      {login && <AccountAccess onAuthenticated={connect} />}
      {login && auth.currentSession() && (
        <button className="btn primary" onClick={() => void connect()}>
          Conectar este cofre à conta autenticada
        </button>
      )}
      {linked && (
        <button
          className="text-btn danger"
          disabled={s.demo}
          onClick={async () => {
            try {
              const leaving = auth.signOut(s.owner);
              s.lock();
              await leaving;
            } catch (e) {
              useFinance.getState().message((e as Error).message);
            }
          }}
        >
          <LogOut size={16} />
          Sair da conta neste dispositivo
        </button>
      )}
      <small className="muted">
        Bloquear preserva o acesso offline com a senha-mestra. Sair da conta
        exige novo login online neste dispositivo e preserva os dados e
        operações pendentes.
      </small>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {setup && <ServerSetup close={() => setSetup(false)} />}
    </section>
  );
}
