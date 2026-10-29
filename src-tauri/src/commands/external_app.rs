use std::process::Command;

/// Opens `file_path` in the program at `app_path` (an `.app` bundle on macOS).
/// The program keeps running on its own after Photokin returns.
#[tauri::command]
pub fn open_file_with_app(file_path: String, app_path: String) -> Result<(), String> {
    if file_path.is_empty() || app_path.is_empty() {
        return Err("Missing file path or app path".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-a").arg(&app_path);
        command
    };

    #[cfg(not(target_os = "macos"))]
    let mut command = Command::new(&app_path);

    command
        .arg(&file_path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not start the app: {error}"))
}
