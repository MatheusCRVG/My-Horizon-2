export const isNative = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export async function openExternal(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(import.meta.env.DEV && parsed.hostname === "localhost")
  )
    throw Error("O endereço externo precisa usar HTTPS.");
  if (isNative()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(parsed.href);
  } else location.assign(parsed.href);
}
