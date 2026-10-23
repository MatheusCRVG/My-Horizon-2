export type CloudConfig = { url: string; key: string };
const configKey = "myhorizon-cloud-config-v1";
export function validateCloudConfig(config: CloudConfig): CloudConfig {
  const url = new URL(config.url.trim());
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw Error("Use HTTPS para conectar ao servidor.");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Informe apenas a URL principal do projeto Supabase.");
  const key = config.key.trim();
  if (!key) throw Error("Informe a chave pública publishable ou anon.");
  if (key.startsWith("sb_secret_"))
    throw Error(
      "Use somente uma chave pública. Chaves secretas não pertencem ao aplicativo.",
    );
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role !== "anon") throw Error();
    } catch {
      throw Error("Chave pública inválida. Não use service_role.");
    }
  }
  return { url: url.origin, key };
}
export function cloudConfig(): CloudConfig | null {
  try {
    const local =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(configKey)
        : null;
    return validateCloudConfig(
      local
        ? JSON.parse(local)
        : {
            url: import.meta.env.VITE_SUPABASE_URL || "",
            key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          },
    );
  } catch {
    return null;
  }
}
export function saveCloudConfig(config: CloudConfig) {
  localStorage.setItem(configKey, JSON.stringify(validateCloudConfig(config)));
}
