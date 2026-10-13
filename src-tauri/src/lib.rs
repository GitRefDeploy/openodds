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

/// The directories an older install could have used, given this install's.
///
/// The SQL plugin resolves a relative database path against the app-config
/// directory, which is the application-data root plus the bundle identifier — so
/// the old file sits in a *sibling* of this install's directory, named after the
/// old identifier. Windows additionally has a local (non-roaming) data root, so
/// both are covered rather than assuming which one this platform's release used.
fn legacy_roots(config_dir: &Path, local_dir: &Path) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for dir in [config_dir, local_dir] {
        if let Some(parent) = dir.parent() {
            roots.push(parent.join(LEGACY_IDENTIFIER));
        }
    }
    roots.sort();
    roots.dedup();
    roots
}

/// Where an older install kept its database file.
fn legacy_database_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return Vec::new();
    };
    // Falling back to the config directory when the local one is unavailable
    // keeps this to the platforms that actually have two roots.
    let local_dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| config_dir.clone());

    legacy_roots(&config_dir, &local_dir)
        .into_iter()
        .map(|root| root.join(LEGACY_DATABASE))
        .collect()
}

/// Copy a database file, and the write-ahead log and shared-memory files SQLite
/// keeps beside it, onto `target`.
///
/// The companions matter: with a write-ahead log in use, the main file alone can
/// be missing the newest writes. Any failure removes the copy again — a database
/// that is missing its log is worse than no copy, and leaving one behind would
/// stop a retry from ever running, because the target would exist by then.
fn copy_database(source: &Path, target: &Path) -> Result<(), String> {
    let directory = target
        .parent()
        .ok_or_else(|| format!("no directory for {}", target.display()))?;
    std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    std::fs::copy(source, target).map_err(|e| e.to_string())?;

    for suffix in ["-wal", "-shm"] {
        let from = with_suffix(source, suffix);
        if !from.exists() {
            continue;
        }
        if let Err(error) = std::fs::copy(&from, with_suffix(target, suffix)) {
            let _ = std::fs::remove_file(target);
            for suffix in ["-wal", "-shm"] {
                let _ = std::fs::remove_file(with_suffix(target, suffix));
            }
            return Err(error.to_string());
        }
    }

    Ok(())
}

/// Bring the first candidate database that exists onto `target`, unless this
/// install already has one.
///
/// Nothing is deleted or moved, so an older version keeps working and a failed
/// copy can simply be retried, and the target is never overwritten, which is also
/// what makes running this more than once harmless.
fn import_into(target: &Path, candidates: &[PathBuf]) -> Result<Option<String>, String> {
    if target.exists() {
        return Ok(None);
    }

    let source = match candidates.iter().find(|path| path.exists()) {
        Some(path) => path,
        None => return Ok(None),
    };

    copy_database(source, target)?;
    Ok(Some(source.display().to_string()))
}

/// Where this install's own database goes, and where an older install's one may
/// be found.
fn import_legacy_database(app: &tauri::AppHandle, file: &str) -> Result<Option<String>, String> {
    let target = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(file);

    import_into(&target, &legacy_database_paths(app))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A directory of its own that cleans up after itself, including when a test
    /// fails and unwinds.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "openodds-import-test-{}-{}",
                name,
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).expect("a scratch directory");
            Scratch(dir)
        }

        fn file(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn looks_for_the_older_install_beside_this_one() {
        // The data root is shared; only the directory named after the identifier
        // differs, which is why the old one is found as a sibling and not by
        // searching the filesystem.
        let roots = legacy_roots(
            &Path::new("/home/me/.config").join("io.github.openodds.app"),
            &Path::new("/home/me/.local/share").join("io.github.openodds.app"),
        );

        assert_eq!(
            roots,
            vec![
                Path::new("/home/me/.config").join(LEGACY_IDENTIFIER),
                Path::new("/home/me/.local/share").join(LEGACY_IDENTIFIER),
            ]
        );
    }

    #[test]
    fn never_mistakes_this_install_for_the_older_one() {
        // One root on both platforms (the usual case outside Windows), and the
        // answer is the sibling, never this install's own directory.
        let config = Path::new("/home/me/.config").join("io.github.openodds.app");

        let roots = legacy_roots(&config, &config);

        assert_eq!(
            roots,
            vec![Path::new("/home/me/.config").join(LEGACY_IDENTIFIER)]
        );
        assert!(roots
            .iter()
            .all(|root| !root.ends_with("io.github.openodds.app")));
    }

    #[test]
    fn copies_the_first_candidate_that_exists() {
        let scratch = Scratch::new("candidates");
        let missing = scratch.file("io.github.bet-tracker.app/bet-tracker.db");
        let present = scratch.file("elsewhere/bet-tracker.db");
        std::fs::create_dir_all(present.parent().unwrap()).unwrap();
        std::fs::write(&present, b"bets").unwrap();
        let target = scratch.file("own/openodds.db");

        let copied = import_into(&target, &[missing, present.clone()]).unwrap();

        assert_eq!(copied, Some(present.display().to_string()));
        assert_eq!(std::fs::read(&target).unwrap(), b"bets");
    }

    #[test]
    fn copies_the_write_ahead_log_beside_the_database() {
        let scratch = Scratch::new("wal");
        let source = scratch.file("old/bet-tracker.db");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, b"bets").unwrap();
        std::fs::write(with_suffix(&source, "-wal"), b"newest bet").unwrap();
        let target = scratch.file("own/openodds.db");

        import_into(&target, &[source]).unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"bets");
        assert_eq!(
            std::fs::read(with_suffix(&target, "-wal")).unwrap(),
            b"newest bet"
        );
    }

    #[test]
    fn never_overwrites_a_database_this_install_already_has() {
        let scratch = Scratch::new("existing");
        let source = scratch.file("old/bet-tracker.db");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, b"old bets").unwrap();
        let target = scratch.file("own/openodds.db");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, b"this install's bets").unwrap();

        let copied = import_into(&target, &[source]).unwrap();

        assert_eq!(copied, None);
        assert_eq!(std::fs::read(&target).unwrap(), b"this install's bets");
    }

    #[test]
    fn a_machine_with_no_older_install_is_left_alone() {
        let scratch = Scratch::new("fresh");
        let target = scratch.file("own/openodds.db");

        assert_eq!(import_into(&target, &[scratch.file("old/bet-tracker.db")]), Ok(None));
        assert!(!target.exists());
    }

    #[test]
    fn leaves_no_half_copy_behind_when_the_log_cannot_be_written() {
        let scratch = Scratch::new("halfcopy");
        let source = scratch.file("old/bet-tracker.db");
        std::fs::create_dir_all(source.parent().unwrap()).unwrap();
        std::fs::write(&source, b"bets").unwrap();
        std::fs::write(with_suffix(&source, "-wal"), b"newest bet").unwrap();
        let target = scratch.file("own/openodds.db");
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        // A directory where the log has to go: copying a file onto it fails.
        std::fs::create_dir(with_suffix(&target, "-wal")).unwrap();

        let copied = import_into(&target, &[source]);

        assert!(copied.is_err(), "a copy that cannot complete must report failure");
        assert!(
            !target.exists(),
            "the database must not be left behind without its log"
        );
    }
}
