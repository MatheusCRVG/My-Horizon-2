fn main() {
    #[cfg(feature = "native-shell")]
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "vault_get", "vault_list", "vault_put", "vault_commit", "outbox_list",
            ]),
        ),
    )
    .expect("Falha ao preparar o aplicativo nativo");
}
