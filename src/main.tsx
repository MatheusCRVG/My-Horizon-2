import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./horizon.css";
import "./readability.css";
import "./savings.css";
import "./my-horizon.css";
import "./workspace.css";
import "./horizon-planning.css";
import "./cover-refinement.css";
import "./mobile52.css";
import "./premium52.css";
import { BRAND } from "./core/brand";
import { isNative, openExternal } from "./services/platform";
import { useFinance } from "./core/store";
if (isNative()) {
  document.documentElement.classList.add("native-app");
  document.addEventListener("click", (event) => {
    const anchor =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || event.defaultPrevented)
      return;
    const url = new URL(anchor.href, location.href);
    if (
      url.origin !== location.origin &&
      ["https:", "http:"].includes(url.protocol)
    ) {
      event.preventDefault();
      void openExternal(url.href).catch(() =>
        useFinance
          .getState()
          .message(
            "Não foi possível abrir o endereço no navegador do dispositivo.",
          ),
      );
    } else if (url.origin === location.origin && anchor.target === "_blank") {
      event.preventDefault();
      location.assign(url.href);
    }
  });
}
document.documentElement.style.setProperty("--brand-blue", BRAND.blue);
document.documentElement.style.setProperty("--brand-action", BRAND.action);
document.documentElement.style.setProperty("--brand-navy", BRAND.navy);
document.title = `${BRAND.name} · Seus próximos horizontes`;
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal">
        <h1>Não foi possível abrir esta tela</h1>
        <p>
          Seu cofre local continua criptografado. Recarregue o aplicativo para
          tentar novamente.
        </p>
        <button onClick={() => location.reload()}>Recarregar</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <App />
    </Boundary>
  </React.StrictMode>,
);
if (!isNative() && "serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Offline availability is shown by the browser; never log vault data. */
    });
  });
