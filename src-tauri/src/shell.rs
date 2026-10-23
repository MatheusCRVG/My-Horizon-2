use crate::repository::{OperationRecord, Repository, VaultRecord};
use std::sync::Mutex;
use tauri::Manager;

struct Storage(Mutex<Repository>);
fn locked<T>(state: &Storage, run: impl FnOnce(&mut Repository) -> Result<T, String>) -> Result<T, String> {
    let mut repository = state.0.lock().map_err(|_| "O armazenamento local está indisponível. Reinicie o aplicativo sem remover seus dados.".to_string())?;
    run(&mut repository)
}

#[tauri::command(async)]
fn vault_get(state: tauri::State<'_, Storage>, owner: String) -> Result<Option<VaultRecord>, String> {
    locked(&state, |db| db.get(&owner))
}
#[tauri::command(async)]
fn vault_list(state: tauri::State<'_, Storage>) -> Result<Vec<VaultRecord>, String> {
    locked(&state, |db| db.list())
}
#[tauri::command(async)]
fn vault_put(state: tauri::State<'_, Storage>, record: VaultRecord) -> Result<(), String> {
    locked(&state, |db| db.put(record))
}
#[tauri::command(async)]
fn vault_commit(state: tauri::State<'_, Storage>, record: VaultRecord, operations: Vec<OperationRecord>, acknowledged: Vec<String>) -> Result<(), String> {
    locked(&state, |db| db.commit(record, operations, acknowledged))
}
#[tauri::command(async)]
fn outbox_list(state: tauri::State<'_, Storage>, owner: String) -> Result<Vec<OperationRecord>, String> {
    locked(&state, |db| db.outbox(&owner))
}

pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // The plugin's deep-link feature forwards a second instance's URL.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    builder
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let repository = Repository::open(directory.join("my-horizon.sqlite3"))
                .map_err(std::io::Error::other)?;
            app.manage(Storage(Mutex::new(repository)));
            #[cfg(all(feature = "signed-updates", not(any(target_os = "android", target_os = "ios"))))]
            {
                // The optional profile refuses empty keys/endpoints instead of
                // silently presenting an updater that cannot verify releases.
                let update = app.config().plugins.0.get("updater");
                let key = update.and_then(|v| v.get("pubkey")).and_then(|v| v.as_str()).unwrap_or("");
                let endpoints = update.and_then(|v| v.get("endpoints")).and_then(|v| v.as_array());
                if key.trim().is_empty() || endpoints.is_none_or(|urls| urls.is_empty() || urls.iter().any(|url| !url.as_str().is_some_and(|url| url.starts_with("https://")))) {
                    return Err(std::io::Error::other("O perfil de atualização exige chave pública e endpoints HTTPS de releases assinadas.").into());
                }
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            #[cfg(all(debug_assertions, any(target_os = "windows", target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            let window = &app.config().app.windows[0];
            tauri::WebviewWindowBuilder::from_config(app.handle(), window)?
                .on_navigation(|url| {
                    let packaged = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (["http", "https"].contains(&url.scheme()) && url.host_str() == Some("tauri.localhost") && url.port().is_none());
                    let dev = cfg!(debug_assertions) && url.scheme() == "http" && url.host_str() == Some("localhost") && url.port() == Some(5173);
                    packaged || dev
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![vault_get, vault_list, vault_put, vault_commit, outbox_list])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o My Horizon+. Os dados locais foram preservados.");
}
