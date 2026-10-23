import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const first = (paths) => paths.filter(Boolean).find(existsSync);
function probe(program, args = ["--version"]) {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
  });
  return {
    ok: !result.error && result.status === 0,
    detail:
      ((result.stdout || "") + (result.stderr || ""))
        .trim()
        .split(/\r?\n/)[0] ||
      (result.error
        ? "Não localizado ou não executável"
        : `Saída ${result.status}`),
  };
}
function executable(name, candidates = []) {
  for (const command of [name, ...candidates.filter(Boolean)]) {
    const result = probe(command);
    if (result.ok) return { command, ...result };
  }
  return {
    command: name,
    ok: false,
    detail: "Não localizado no PATH nem nos caminhos conhecidos",
  };
}
export function inspectNative() {
  const cargoBin = join(os.homedir(), ".cargo", "bin");
  const rust = Object.fromEntries(
    ["cargo", "rustc", "rustup"].map((name) => [
      name,
      executable(name, [join(cargoBin, name + (win ? ".exe" : ""))]),
    ]),
  );
  const sdk = first([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    win
      ? join(process.env.LOCALAPPDATA || "", "Android", "Sdk")
      : join(os.homedir(), "Android", "Sdk"),
    join(os.homedir(), "Library", "Android", "sdk"),
  ]);
  const ndkDir = sdk && join(sdk, "ndk");
  const ndks =
    ndkDir && existsSync(ndkDir)
      ? readdirSync(ndkDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];
  const ndk = first([
    process.env.NDK_HOME,
    ndks.length ? join(ndkDir, ndks.at(-1)) : undefined,
  ]);
  const jbr = win
    ? "C:\\Program Files\\Android\\Android Studio\\jbr"
    : "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
  const javaHome = first([process.env.JAVA_HOME, jbr]);
  const java = executable("java", [
    javaHome && join(javaHome, "bin", win ? "java.exe" : "java"),
  ]);
  // Java prints its version to stderr and expects -version.
  const javaVersion = probe(java.command, ["-version"]);
  const javac = executable("javac", [
    javaHome && join(javaHome, "bin", win ? "javac.exe" : "javac"),
  ]);
  const javaMatch =
    /\b(?:openjdk|java)(?:\s+version)?\s+"?(\d+)(?:\.(\d+))?/i.exec(
      javaVersion.detail,
    );
  const javaMajor = javaMatch
    ? Number(javaMatch[1] === "1" ? javaMatch[2] : javaMatch[1])
    : 0;
  const javaSupported = javaVersion.ok && javac.ok && javaMajor >= 17;
  const adb = sdk
    ? probe(join(sdk, "platform-tools", win ? "adb.exe" : "adb"), ["version"])
    : { ok: false, detail: "SDK Android não localizado" };
  const vswhere =
    win &&
    first([
      join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe",
      ),
    ]);
  const visualStudio = vswhere
    ? probe(vswhere, [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ])
    : { ok: false, detail: "Visual Studio C++ Build Tools não localizado" };
  if (visualStudio.ok && !/^[a-z]:\\/i.test(visualStudio.detail))
    visualStudio.ok = false;
  const kits = join(
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Windows Kits",
    "10",
  );
  const kitIncludes = join(kits, "Include");
  const windowsSdk =
    win &&
    existsSync(kitIncludes) &&
    readdirSync(kitIncludes).some(
      (version) =>
        existsSync(join(kitIncludes, version, "um", "Windows.h")) &&
        existsSync(join(kits, "Lib", version, "um", "x64", "kernel32.lib")),
    );
  const requiredTargets = [
    "aarch64-linux-android",
    "armv7-linux-androideabi",
    "i686-linux-android",
    "x86_64-linux-android",
  ];
  const targetResult = rust.rustup.ok
    ? spawnSync(rust.rustup.command, ["target", "list", "--installed"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      })
    : null;
  const installedTargets = (targetResult?.stdout || "").trim().split(/\s+/);
  const androidTargets = requiredTargets.every((target) =>
    installedTargets.includes(target),
  );
  const rustVersion = /rustc (\d+)\.(\d+)/.exec(rust.rustc.detail);
  const rustSupported =
    rust.rustc.ok &&
    !!rustVersion &&
    (Number(rustVersion[1]) > 1 || Number(rustVersion[2]) >= 90);
  const ndkReady = !!ndk && existsSync(join(ndk, "source.properties"));
  const sdkComponents =
    !!sdk &&
    ["platforms", "build-tools", "cmdline-tools"].every((part) =>
      existsSync(join(sdk, part)),
    );
  const cli = existsSync(
    join(root, "node_modules", "@tauri-apps", "cli", "tauri.js"),
  );
  const checks = [
    {
      name: "Node.js 22+",
      ok: Number(process.versions.node.split(".")[0]) >= 22,
      detail: process.version,
    },
    {
      name: "Tauri CLI local",
      ok: cli,
      detail: cli ? "node_modules/@tauri-apps/cli" : "Execute npm ci",
    },
    ...Object.entries(rust).map(([name, result]) => ({ name, ...result })),
    {
      name: "Rust 1.90+",
      ok: rustSupported,
      detail: rustSupported
        ? "Versão compatível"
        : "Instale/atualize o toolchain estável pelo rustup",
    },
    ...(win
      ? [
          { name: "Visual Studio C++ x64", ...visualStudio },
          {
            name: "Windows SDK x64",
            ok: !!windowsSdk,
            detail: windowsSdk
              ? "Headers e bibliotecas x64 encontrados"
              : "Instale Windows SDK junto dos C++ Build Tools",
          },
        ]
      : []),
    {
      name: "Java JDK 17+",
      ok: javaSupported,
      detail: javaVersion.ok
        ? `${javaVersion.detail}; javac ${javac.ok ? "presente" : "ausente"}`
        : "Instale o JDK fornecido pelo Android Studio",
    },
    { name: "Android SDK", ok: !!sdk, detail: sdk || "ANDROID_HOME ausente" },
    { name: "Android NDK", ok: ndkReady, detail: ndk || "NDK_HOME ausente" },
    {
      name: "Android SDK componentes",
      ok: sdkComponents,
      detail: sdkComponents
        ? "platforms, build-tools e cmdline-tools encontrados"
        : "Instale os componentes pelo SDK Manager",
    },
    {
      name: "Targets Rust Android",
      ok: androidTargets,
      detail:
        requiredTargets
          .filter((target) => !installedTargets.includes(target))
          .join(", ") || "Os quatro targets estão instalados",
    },
    { name: "Android platform-tools", ...adb },
    {
      name: "Ícone oficial",
      ok: existsSync(join(root, "public", "icon-512.png")),
      detail: "public/icon-512.png",
    },
    {
      name: "Ícones nativos",
      ok: existsSync(join(root, "src-tauri", "icons", "icon.ico")),
      detail: "src-tauri/icons",
    },
  ];
  return {
    root,
    platform: process.platform,
    checks,
    rust,
    sdk,
    ndk,
    javaHome,
    windowsReady:
      win &&
      rust.cargo.ok &&
      rustSupported &&
      visualStudio.ok &&
      !!windowsSdk &&
      cli,
    androidReady:
      rust.cargo.ok &&
      rustSupported &&
      javaSupported &&
      sdkComponents &&
      ndkReady &&
      androidTargets &&
      adb.ok &&
      cli,
  };
}

export function printNative(report) {
  console.log("My Horizon+ — diagnóstico nativo (não instala dependências)");
  for (const check of report.checks)
    console.log(`${check.ok ? "OK" : "FALTA"}  ${check.name}: ${check.detail}`);
  console.log(
    `\nWindows: ${report.windowsReady ? "pré-requisitos principais encontrados" : "compilação ainda indisponível"}. Android: ${report.androidReady ? "pré-requisitos principais encontrados" : "compilação ainda indisponível"}.`,
  );
  console.log(
    "Encontrar ferramentas não equivale a compilar: WebView2, targets Rust, licenças SDK e assinaturas também precisam ser conferidos. iOS exige macOS/Xcode.",
  );
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const report = inspectNative();
  if (process.argv.includes("--json"))
    console.log(JSON.stringify(report, null, 2));
  else printNative(report);
  if (
    process.argv.includes("--strict") &&
    !(process.argv.includes("--android")
      ? report.androidReady
      : report.windowsReady)
  )
    process.exitCode = 1;
}
