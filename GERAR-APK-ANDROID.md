# My Horizon+ 5.1.0 — APK Android (teste)

Este pacote contém o **código-fonte original** com um fluxo adicional do **GitHub Actions** em `.github/workflows/android-apk.yml`.

> **IMPORTANTE:** Esta é uma configuração pronta para tentar **compilar** um APK de teste. **Não** é um APK pronto. O build não foi executado neste ambiente porque faltam Rust, Android SDK e Android NDK e não existe acesso de rede para instalar dependências. A compatibilidade com o celular ainda precisa de teste real.

## Gerar o APK sem instalar Android Studio

1. Crie um repositório **privado** no GitHub, para não expor os dados nem o código do projeto.
2. Extraia o ZIP e envie **o conteúdo da pasta**, incluindo `.github/workflows/android-apk.yml`, para a raiz do repositório (ou faça commit/push de todos os arquivos via Git).
3. Abra o repositório no GitHub e acesse **Actions** > **Gerar APK Android (teste)** > **Run workflow**.
4. Se o workflow concluir com sucesso, abra a execução concluída e, em **Artifacts**, baixe **My-Horizon-Plus-Android-5.1.0-APK-TESTE**.
5. Extraia o arquivo baixado, envie o `.apk` ao celular e instale-o. O Android poderá pedir autorização para instalar de fontes externas.

**Este é um APK de teste para Android 64-bit (arm64/aarch64)**, não um pacote publicado na Play Store. Em builds reais de produção, configure uma identidade de assinatura própria. Teste criação de cofre, encerramento/reabertura, gravação local, modo offline, exportação de arquivo e sincronização. O armazenamento local deve preservar dados entre sessões, mas isso precisa ser confirmado no Android.

## Se a compilação falhar

Abra a execução do GitHub Actions, copie o trecho de erro do passo que falhou (principalmente Rust, Gradle e Android) e envie para revisão. Não aceite como entrega um APK gerado sem teste no aparelho.

## Onde está o APK

No GitHub Actions, dentro do artefato **My-Horizon-Plus-Android-5.1.0-APK-TESTE**. No runner de compilação, ele é produzido dentro de `src-tauri/gen/android/app/build/outputs/apk/`.

## Fonte técnica

- https://tauri.app/reference/cli/ (comandos `tauri android init --ci`, `tauri android build --debug --apk`)
- https://v2.tauri.app/start/prerequisites/ (SDK, NDK, Java e Rust)
- https://v2.tauri.app/distribute/sign/android/ (assinatura de produção)
