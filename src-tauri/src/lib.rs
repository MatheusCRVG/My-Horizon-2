pub mod repository;

#[cfg(feature = "native-shell")]
mod shell;

#[cfg(feature = "native-shell")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    shell::run();
}
