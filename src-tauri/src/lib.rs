use serde::Serialize;
use tauri::Manager;

/// Store a credential in the platform-native secret store.
///
/// Values are never written to disk by the app itself, never logged, and never
/// returned to the frontend — only presence is reported.
#[tauri::command]
fn save_secret(service: String, account: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_secret(service: String, account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_secret(service: String, account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    name: String,
}

/// The name comes from `tauri.conf.json` rather than from the crate's package
/// name. They are different strings — the package is `openodds`, the app is
/// OpenOdds — so reading the configured product name keeps the label in step with
/// the window title and the installer instead of drifting from them. The crate
/// name stays as a fallback for a build with no product name set.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: app
            .config()
            .product_name
            .clone()
            .unwrap_or_else(|| env!("CARGO_PKG_NAME").to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_secret,
            get_secret,
            delete_secret,
            app_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
