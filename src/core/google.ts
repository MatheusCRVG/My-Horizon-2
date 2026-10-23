export type Profile = { sub: string; email: string; name: string };
let token = "";
let expires = 0;
let profile: Profile | null = null;
export const clientId = () =>
  localStorage.getItem("f5-google-client") ||
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "";
export function authorized() {
  return !!token && Date.now() < expires;
}
export const currentProfile = () => profile;
export function forgetToken() {
  token = "";
  expires = 0;
  profile = null;
}
let loading: Promise<void> | null = null;
export async function loadGoogle() {
  if ((window as any).google?.accounts?.oauth2) return;
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(
          Error(
            "Não foi possível carregar o login Google. Verifique a conexão.",
          ),
        );
      };
      document.head.append(s);
    });
  await loading;
}
export async function login(): Promise<Profile> {
  if (!clientId().endsWith(".apps.googleusercontent.com"))
    throw Error(
      "Configure o Client ID OAuth público em Configurar acesso Google.",
    );
  await loadGoogle();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: "openid email profile https://www.googleapis.com/auth/drive.file",
      error_callback: () =>
        reject(Error("Login cancelado ou janela bloqueada.")),
      callback: async (r: any) => {
        try {
          if (r.error) throw Error(r.error_description || r.error);
          token = r.access_token;
          expires = Date.now() + (r.expires_in - 60) * 1000;
          const resp = await fetch(
            "https://openidconnect.googleapis.com/v1/userinfo",
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!resp.ok)
            throw Error("Não foi possível identificar a conta Google.");
          profile = await resp.json();
          resolve(profile!);
        } catch (e) {
          forgetToken();
          reject(e);
        }
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
async function request(url: string, options: RequestInit = {}) {
  if (!authorized())
    throw Error("Autorização Google expirada. Reconecte para sincronizar.");
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!r.ok) {
    if (r.status === 401) forgetToken();
    throw Error(
      `Google Drive: ${r.status === 401 ? "reconecte sua conta" : r.status === 403 ? "verifique se a Drive API está ativada e se o acesso foi autorizado" : `erro ${r.status}`}.`,
    );
  }
  return r;
}
const api = "https://www.googleapis.com/drive/v3/files";
export type DriveFile = { id: string; name: string; createdTime: string };
async function list(q: string) {
  const files: DriveFile[] = [];
  let page = "";
  do {
    const u = new URL(api);
    u.searchParams.set("q", q);
    u.searchParams.set("fields", "nextPageToken,files(id,name,createdTime)");
    u.searchParams.set("pageSize", "1000");
    if (page) u.searchParams.set("pageToken", page);
    const r = await (await request(u.href)).json();
    files.push(...r.files);
    page = r.nextPageToken ?? "";
  } while (page);
  return files;
}
export async function folders() {
  return list(
    "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='financeiro5' and value='vault' }",
  );
}
export async function snapshots() {
  const fs = await folders();
  const files: DriveFile[] = [];
  for (const f of fs)
    files.push(
      ...(await list(
        `trashed = false and '${f.id}' in parents and mimeType = 'application/json'`,
      )),
    );
  return files.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
}
export async function downloadSnapshot(id: string) {
  return (await request(`${api}/${encodeURIComponent(id)}?alt=media`)).json();
}
export async function uploadSnapshot(envelope: unknown) {
  let fs = await folders();
  if (!fs.length) {
    const f = await (
      await request(api + "?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Horizon One",
          mimeType: "application/vnd.google-apps.folder",
          appProperties: { financeiro5: "vault" },
        }),
      })
    ).json();
    fs = [f];
  }
  const boundary = "financeiro5_" + crypto.randomUUID();
  const meta = {
    name: `snapshot-${crypto.randomUUID()}.json`,
    mimeType: "application/json",
    parents: [fs[0].id],
  };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(envelope)}\r\n--${boundary}--`;
  return (
    await request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    )
  ).json() as Promise<{ id: string }>;
}
