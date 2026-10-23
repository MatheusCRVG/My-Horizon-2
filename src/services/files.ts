import { isNative } from "./platform";
export async function saveExport(
  data: string | Uint8Array,
  name: string,
  type: string,
) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isNative()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const extension = name.split(".").pop() || "json";
    const path = await save({
      title: "Salvar arquivo do My Horizon+",
      defaultPath: name,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([bytes], { type }));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  return true;
}
