import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ignored = new Set([
  ".git",
  ".openai",
  ".tools",
  "node_modules",
  "dist",
  "target",
  "gen",
  "artifacts",
  "releases",
  "playwright-report",
]);
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isSymbolicLink() ||
      ignored.has(entry.name) ||
      entry.name.startsWith("test-results") ||
      (entry.name.startsWith(".env") && entry.name !== ".env.example") ||
      /\.(?:sqlite3?|db|jks|keystore|key|tsbuildinfo|zip|gz)$/.test(entry.name)
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile())
      files.push(relative(root, path).replaceAll("\\", "/"));
  }
}
visit(root);
for (const required of [
  "src/App.tsx",
  "src-tauri/Cargo.toml",
  "package-lock.json",
  "docs/INDEPENDENCIA.md",
]) {
  if (!files.includes(required))
    throw Error(`Source export incomplete: ${required}`);
}
if (files.some((path) => /[\r\n]/.test(path)))
  throw Error("Unsupported source filename.");
mkdirSync(join(root, "releases"), { recursive: true });
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const archive = join(
  root,
  "releases",
  `my-horizon-plus-${pkg.version}-source-${stamp}.tar.gz`,
);
if (existsSync(archive)) throw Error("Archive already exists.");
const temporary = mkdtempSync(join(tmpdir(), "my-horizon-export-"));
const list = join(temporary, "files.txt");
try {
  writeFileSync(list, files.sort().join("\n") + "\n");
  const result = spawnSync("tar", ["-czf", archive, "-C", root, "-T", list], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw Error(result.stderr || "Install tar to export the source.");
  const hash = createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(
    `${archive}.sha256`,
    `${hash}  ${archive.split(/[\\/]/).pop()}\n`,
  );
  console.log(
    JSON.stringify({ archive, sha256: hash, files: files.length }, null, 2),
  );
} finally {
  if (existsSync(list)) unlinkSync(list);
  rmdirSync(temporary);
}
