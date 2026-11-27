// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod tray;

use std::str::FromStr;
#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use db::{DbState, NoteItem, ReorderItem, RoadmapItem, TabItem, TodoItem};
use serde::Serialize;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Serialize, Clone)]
struct ThemeSyncPayload {
    theme: String,
    style: String,
}

// ----------------- TAB COMMANDS -----------------
#[tauri::command]
fn get_all_tabs(state: State<DbState>) -> Result<Vec<TabItem>, String> {
    state.get_all_tabs().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_tab(name: String, state: State<DbState>) -> Result<TabItem, String> {
    state.create_tab(name).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_tab(id: String, name: String, state: State<DbState>) -> Result<TabItem, String> {
    state.update_tab(id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_tab(id: String, state: State<DbState>) -> Result<(), String> {
    state.delete_tab(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_tabs(items: Vec<ReorderItem>, state: State<DbState>) -> Result<(), String> {
    state.reorder_tabs(items).map_err(|e| e.to_string())
}

// ----------------- TODO COMMANDS -----------------
#[tauri::command]
fn get_all_todos(state: State<DbState>) -> Result<Vec<TodoItem>, String> {
    state.get_all_todos().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_todo(
    tab_id: String,
    text: String,
    priority: String,
    due_date: Option<String>,
    state: State<DbState>,
) -> Result<TodoItem, String> {
    state
        .create_todo(tab_id, text, priority, due_date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_todo(id: String, state: State<DbState>) -> Result<TodoItem, String> {
    state.toggle_todo(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_todo(id: String, text: String, state: State<DbState>) -> Result<TodoItem, String> {
    state.update_todo(id, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_todo_deadline(
    id: String,
    due_date: Option<String>,
    state: State<DbState>,
) -> Result<TodoItem, String> {
    state.update_todo_deadline(id, due_date).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_todo(id: String, state: State<DbState>) -> Result<(), String> {
    state.delete_todo(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_todos(items: Vec<ReorderItem>, state: State<DbState>) -> Result<(), String> {
    state.reorder_todos(items).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_todo_priority(
    id: String,
    priority: String,
    state: State<DbState>,
) -> Result<TodoItem, String> {
    state.update_todo_priority(id, priority).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_todo_to_tab(
    id: String,
    tab_id: String,
    state: State<DbState>,
) -> Result<TodoItem, String> {
    state.move_todo_to_tab(id, tab_id).map_err(|e| e.to_string())
}

// ----------------- NOTE TAB COMMANDS -----------------
#[tauri::command]
fn get_all_note_tabs(state: State<DbState>) -> Result<Vec<TabItem>, String> {
    state.get_all_note_tabs().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_note_tab(name: String, state: State<DbState>) -> Result<TabItem, String> {
    state.create_note_tab(name).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_note_tab(id: String, name: String, state: State<DbState>) -> Result<TabItem, String> {
    state.update_note_tab(id, name).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note_tab(id: String, state: State<DbState>) -> Result<(), String> {
    state.delete_note_tab(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_note_tabs(items: Vec<ReorderItem>, state: State<DbState>) -> Result<(), String> {
    state.reorder_note_tabs(items).map_err(|e| e.to_string())
}

// ----------------- NOTE COMMANDS -----------------
#[tauri::command]
fn get_all_notes(state: State<DbState>) -> Result<Vec<NoteItem>, String> {
    state.get_all_notes().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_note_by_tab(tab_id: String, state: State<DbState>) -> Result<Option<NoteItem>, String> {
    state.get_note_by_tab(tab_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn upsert_note(tab_id: String, content: String, state: State<DbState>) -> Result<NoteItem, String> {
    state.upsert_note(tab_id, content).map_err(|e| e.to_string())
}

// ----------------- ROADMAP COMMANDS -----------------
#[tauri::command]
fn get_all_roadmaps(state: State<DbState>) -> Result<Vec<RoadmapItem>, String> {
    state.get_all_roadmaps().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_roadmap(
    title: String,
    kind: String,
    is_visible: i32,
    data_json: String,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<RoadmapItem, String> {
    let item = state
        .create_roadmap(title, kind, is_visible, data_json)
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(item)
}

#[tauri::command]
fn update_roadmap_meta(
    id: String,
    title: String,
    is_visible: i32,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<RoadmapItem, String> {
    let item = state
        .update_roadmap_meta(id, title, is_visible)
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(item)
}

#[tauri::command]
fn update_roadmap_data(
    id: String,
    data_json: String,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<RoadmapItem, String> {
    let item = state
        .update_roadmap_data(id, data_json)
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(item)
}

#[tauri::command]
fn delete_roadmap(
    id: String,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state.delete_roadmap(id).map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(())
}

#[tauri::command]
fn reorder_roadmaps(
    items: Vec<ReorderItem>,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state.reorder_roadmaps(items).map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(())
}

#[tauri::command]
async fn open_roadmap_studio(
    roadmap_id: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(win) = app_handle.get_webview_window("roadmap-studio") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        if let Some(ref rid) = roadmap_id {
            if !rid.trim().is_empty() {
                let _ = win.emit("roadmap_studio_select", rid.trim().to_string());
            }
        }
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app_handle,
        "roadmap-studio",
        WebviewUrl::App("roadmap-studio.html".into()),
    )
    .title("TodoLite — Lộ Trình Studio")
    .inner_size(1160.0, 740.0)
    .min_inner_size(860.0, 560.0)
    .resizable(true)
    .maximizable(true)
    .decorations(true)
    .always_on_top(false)
    .center();

    if let Some(ref rid) = roadmap_id {
        let clean = rid.trim();
        if !clean.is_empty() {
            let escaped = clean.replace('\\', "\\\\").replace('"', "\\\"");
            builder = builder.initialization_script(&format!(
                "window.__INITIAL_ROADMAP_ID__ = \"{}\";",
                escaped
            ));
        }
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn sync_theme_to_windows(
    theme: String,
    style: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let _ = app_handle.emit("app_theme_synced", ThemeSyncPayload { theme, style });
    Ok(())
}

// ----------------- WINDOW ACTIONS -----------------
#[tauri::command]
fn set_always_on_top(always_on_top: bool, window: WebviewWindow) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn register_global_toggle_shortcut(shortcut: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = app_handle.global_shortcut().unregister_all();
    let s = shortcut.trim();
    if s.is_empty() {
        return Ok(());
    }
    let parsed = Shortcut::from_str(s).map_err(|e| format!("Invalid shortcut format: {:?}", e))?;
    app_handle.global_shortcut().register(parsed).map_err(|e| e.to_string())?;
    Ok(())
}

// ----------------- FILE & EXPORT ACTIONS -----------------
#[tauri::command]
fn get_default_export_directory() -> Result<String, String> {
    let base = std::env::var("USERPROFILE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    let export_dir = base.join("Documents").join("TodoLite_Exports");
    if !export_dir.exists() {
        let _ = std::fs::create_dir_all(&export_dir);
    }
    Ok(export_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_export_directory(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new().set_title("Chọn thư mục xuất tệp TodoLite");
    if let Some(ref path) = default_path {
        if !path.trim().is_empty() {
            let p = std::path::Path::new(path);
            if p.exists() {
                dialog = dialog.set_directory(p);
            }
        }
    }
    let res = dialog.pick_folder();
    Ok(res.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_exported_file(
    directory: String,
    filename: String,
    content: String,
) -> Result<String, String> {
    let dir_path = std::path::Path::new(&directory);
    if !dir_path.exists() {
        std::fs::create_dir_all(dir_path).map_err(|e| e.to_string())?;
    }
    let full_path = dir_path.join(&filename);
    std::fs::write(&full_path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_export_directory(directory: String) -> Result<(), String> {
    let path = std::path::Path::new(&directory);
    if !path.exists() {
        let _ = std::fs::create_dir_all(path);
    }
    std::process::Command::new("explorer")
        .arg(&directory)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reset_database(state: State<DbState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    state.reset_database().map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(())
}

#[tauri::command]
fn restore_backup(
    tabs: Vec<TabItem>,
    todos: Vec<TodoItem>,
    note_tabs: Vec<TabItem>,
    notes: Vec<NoteItem>,
    roadmaps: Option<Vec<RoadmapItem>>,
    state: State<DbState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state
        .restore_backup(tabs, todos, note_tabs, notes, roadmaps.unwrap_or_default())
        .map_err(|e| e.to_string())?;
    let _ = app_handle.emit("roadmaps_changed", ());
    Ok(())
}

// ----------------- AUTOSTART ACTIONS -----------------
#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
        if let Ok(run_key) = hkcu.open_subkey(path) {
            let val: Result<String, _> = run_key.get_value("TodoLite");
            if let Ok(cmd) = val {
                return Ok(!cmd.trim().is_empty());
            }
        }
        Ok(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
        let (run_key, _) = hkcu
            .create_subkey(path)
            .map_err(|e| format!("Failed to access Windows Run registry key: {}", e))?;

        if enable {
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Failed to get current executable path: {}", e))?;
            let mut exe_str = current_exe.to_string_lossy().to_string();
            if exe_str.starts_with(r"\\?\") {
                exe_str = exe_str[4..].to_string();
            }
            let quoted_cmd = format!("\"{}\"", exe_str);
            run_key
                .set_value("TodoLite", &quoted_cmd)
                .map_err(|e| format!("Failed to write autostart registry entry: {}", e))?;
            Ok(true)
        } else {
            match run_key.delete_value("TodoLite") {
                Ok(_) => Ok(false),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
                Err(e) => Err(format!("Failed to delete autostart registry entry: {}", e)),
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

fn main() {
    let db = DbState::new().expect("Failed to initialize SQLite database");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            let is_minimized = window.is_minimized().unwrap_or(false);
                            if is_visible && !is_minimized {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .manage(db)
        .setup(|app| {
            let app_handle = app.handle().clone();
            tray::setup_tray(&app_handle)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_all_tabs,
            create_tab,
            update_tab,
            delete_tab,
            reorder_tabs,
            get_all_todos,
            create_todo,
            toggle_todo,
            update_todo,
            update_todo_priority,
            update_todo_deadline,
            move_todo_to_tab,
            delete_todo,
            reorder_todos,
            get_all_note_tabs,
            create_note_tab,
            update_note_tab,
            delete_note_tab,
            reorder_note_tabs,
            get_all_notes,
            get_note_by_tab,
            upsert_note,
            get_all_roadmaps,
            create_roadmap,
            update_roadmap_meta,
            update_roadmap_data,
            delete_roadmap,
            reorder_roadmaps,
            open_roadmap_studio,
            sync_theme_to_windows,
            set_always_on_top,
            minimize_window,
            hide_window,
            exit_app,
            register_global_toggle_shortcut,
            get_default_export_directory,
            pick_export_directory,
            save_exported_file,
            open_export_directory,
            reset_database,
            restore_backup,
            get_autostart,
            set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TodoLite application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_parsing() {
        assert!(Shortcut::from_str("Alt+Space").is_ok(), "Alt+Space should parse");
        assert!(Shortcut::from_str("Ctrl+Shift+T").is_ok(), "Ctrl+Shift+T should parse");
        assert!(Shortcut::from_str("Control+Shift+T").is_ok(), "Control+Shift+T should parse");
        assert!(Shortcut::from_str("Alt+1").is_ok(), "Alt+1 should parse");
        assert!(Shortcut::from_str("F11").is_ok(), "F11 should parse");
    }

    #[test]
    fn test_autostart_query() {
        let res = get_autostart();
        assert!(res.is_ok(), "get_autostart should execute without error");
    }

    #[test]
    fn test_autostart_toggle() {
        let initial = get_autostart().unwrap_or(false);
        // Test enabling
        let set_res = set_autostart(true);
        assert!(set_res.is_ok(), "Setting autostart to true should succeed");
        assert_eq!(get_autostart().unwrap(), true, "Autostart should now be true");

        // Test disabling
        let unset_res = set_autostart(false);
        assert!(unset_res.is_ok(), "Setting autostart to false should succeed");
        assert_eq!(get_autostart().unwrap(), false, "Autostart should now be false");

        // Restore initial state
        let _ = set_autostart(initial);
    }
}
