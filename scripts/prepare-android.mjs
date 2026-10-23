import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inspectNative, printNative } from "./native-doctor.mjs";

const report = inspectNative();
printNative(report);
console.log(
  `\nPreparação Android, na pasta ${report.root}:\n1. Instalar Android Studio/JDK e, no SDK Manager: SDK Platform, platform-tools, build-tools, command-line tools e NDK (side by side).\n2. Configurar JAVA_HOME, ANDROID_HOME e NDK_HOME para as instalações reais.\n3. rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android\n4. node scripts/prepare-android.mjs --init\n5. npm exec tauri -- android build --apk\nPara Google Play, use npm exec tauri -- android build --aab e configure assinatura de produção.\nEste script não instala SDKs, não aceita licenças e não cria chaves de assinatura.`,
);
if (process.argv.includes("--init")) {
  if (!report.androidReady) {
    console.error(
      "\nInicialização não executada: faltam pré-requisitos. Consulte docs/INSTALACAO-NATIVA.md.",
    );
    process.exitCode = 1;
  } else {
    const generated = join(report.root, "src-tauri", "gen", "android");
    if (existsSync(generated))
      console.log(
        "\nProjeto Android já existe. Nenhum arquivo foi substituído.",
      );
    else {
      const cli = join(
        report.root,
        "node_modules",
        "@tauri-apps",
        "cli",
        "tauri.js",
      );
      const env = {
        ...process.env,
        ...(report.sdk ? { ANDROID_HOME: report.sdk } : {}),
        ...(report.ndk ? { NDK_HOME: report.ndk } : {}),
        ...(report.javaHome ? { JAVA_HOME: report.javaHome } : {}),
      };
      const result = spawnSync(process.execPath, [cli, "android", "init"], {
        cwd: report.root,
        env,
        stdio: "inherit",
        windowsHide: true,
      });
      if (result.error) {
        console.error("Não foi possível executar o Tauri CLI.");
        process.exitCode = 1;
      } else process.exitCode = result.status ?? 1;
    }
  }
}
