use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_i = MenuItem::with_id(app, "toggle_visible", "Hiện / Ẩn TodoLite", true, None::<&str>)?;
    let pin_i = MenuItem::with_id(app, "toggle_pin", "📌 Luôn hiển thị trên cùng", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "open_settings", "⚙️ Cài đặt hệ thống...", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&toggle_i, &pin_i, &settings_i, &quit_i])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("TodoLite — Sổ tay việc cần làm")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_visible" => {
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
            "toggle_pin" => {
                if let Some(window) = app.get_webview_window("main") {
                    let next_pinned = match window.is_always_on_top() {
                        Ok(is_pinned) => !is_pinned,
                        Err(_) => true,
                    };
                    let _ = window.set_always_on_top(next_pinned);
                    let _ = window.emit("tray_pin_toggled", next_pinned);
                }
            }
            "open_settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = window.emit("tray_open_settings", ());
                }
            }
            "quit" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("tray_request_quit", ());
                    let app_handle = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(300));
                        app_handle.exit(0);
                    });
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
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
        .build(app)?;

    Ok(())
}
