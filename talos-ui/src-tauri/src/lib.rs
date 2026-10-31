#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;

            let window = app
                .get_webview_window("main")
                .expect("Talos main window was not created");
            window.navigate(url::Url::parse("http://localhost:3000")?)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Talos desktop shell");
}
