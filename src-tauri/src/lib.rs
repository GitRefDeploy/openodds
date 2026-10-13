use serde::Serialize;
use std::path::{Path, PathBuf};
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

/// The identity this app had before v0.2.0, when it was called Bet Tracker.
///
/// The one place where the old name is allowed to appear. It is not this app's
/// name — it is the name of the installation whose data has to be found — so it
/// cannot be derived from anything else here. Nothing else may reference it.
const LEGACY_IDENTIFIER: &str = "io.github.bet-tracker.app";
const LEGACY_DATABASE: &str = "bet-tracker.db";
const LEGACY_KEYCHAIN_SERVICE: &str = "bet-tracker";

#[derive(Serialize)]
struct LegacyImport {
    /// Absolute path of the old database that was copied, if one was.
    database: Option<String>,
    /// API keys moved out of the old credential-store service, by account name.
    secrets: Vec<String>,
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// Where an older install kept its database file.
///
/// The SQL plugin resolves a relative database path against the app-config
/// directory, which is keyed by the bundle identifier, so the old file sits in a
/// sibling directory named after the old identifier. Windows additionally has a
/// local (non-roaming) data directory, so both roots are tried rather than
/// assuming the one this platform's release happened to use.
fn legacy_database_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for dir in [app.path().app_config_dir(), app.path().app_local_data_dir()] {
        if let Ok(dir) = dir {
            if let Some(parent) = dir.parent() {
                roots.push(parent.join(LEGACY_IDENTIFIER));
            }
        }
    }
    roots.sort();
    roots.dedup();
    roots
        .into_iter()
        .map(|root| root.join(LEGACY_DATABASE))
        .collect()
}

/// Copy an older install's database into place, if there is one to copy and this
/// install has no database of its own yet.
///
/// Nothing is deleted or moved: the old file stays exactly where it was, so an
/// older version keeps working and a failed copy can simply be retried. The
/// target is never overwritten, which is also what makes running this more than
/// once harmless.
fn import_legacy_database(app: &tauri::AppHandle, file: &str) -> Result<Option<String>, String> {
    let target = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(file);

    if target.exists() {
        return Ok(None);
    }

    let source = match legacy_database_paths(app).into_iter().find(|path| path.exists()) {
        Some(path) => path,
        None => return Ok(None),
    };

    let directory = target
        .parent()
        .ok_or_else(|| format!("no directory for {}", target.display()))?;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    std::fs::copy(&source, &target).map_err(|e| e.to_string())?;

    // SQLite keeps recent writes in a write-ahead log beside the database, so a
    // copy of the main file alone can be missing the newest bets. The companions
    // are copied when they exist, and any failure removes the copy again: a
    // partly copied database that is missing its log is worse than no copy, and
    // leaving it behind would stop a retry from ever running.
    for suffix in ["-wal", "-shm"] {
        let from = with_suffix(&source, suffix);
        if !from.exists() {
            continue;
        }
        if let Err(error) = std::fs::copy(&from, with_suffix(&target, suffix)) {
            let _ = std::fs::remove_file(&target);
            for suffix in ["-wal", "-shm"] {
                let _ = std::fs::remove_file(with_suffix(&target, suffix));
            }
            return Err(error.to_string());
        }
    }

    Ok(Some(source.display().to_string()))
}

/// Move API keys out of the old credential-store service.
///
/// Best effort, deliberately. A credential store that is not running reports the
/// same error as a key that was never saved, and refusing to start the app over
/// one optional key would be worse than leaving it for the user to re-enter. A
/// key already entered under the current service always wins.
fn import_legacy_secrets(service: &str, accounts: &[String]) -> Vec<String> {
    let mut moved = Vec::new();
    for account in accounts {
        let Ok(current) = keyring::Entry::new(service, account) else {
            continue;
        };
        if matches!(current.get_password(), Ok(_)) {
            continue;
        }
        let Ok(previous) = keyring::Entry::new(LEGACY_KEYCHAIN_SERVICE, account) else {
            continue;
        };
        if let Ok(value) = previous.get_password() {
            if current.set_password(&value).is_ok() {
                moved.push(account.clone());
            }
        }
    }
    moved
}

/// Bring a pre-rename install's data across, once, before the database is opened.
///
/// The rename gave this app a new bundle identifier, and the operating system
/// keeps application data under a directory named after it, so the first launch
/// of the new name starts with an empty directory and no keys. This is what stops
/// that from meaning "an empty app": the data is copied in before anything reads
/// it.
#[tauri::command]
fn import_legacy_identity(
    app: tauri::AppHandle,
    file: String,
    service: String,
    accounts: Vec<String>,
) -> Result<LegacyImport, String> {
    Ok(LegacyImport {
        database: import_legacy_database(&app, &file)?,
        secrets: import_legacy_secrets(&service, &accounts),
    })
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
            app_info,
            import_legacy_identity
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
