// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod shared;

use commands::*;
use tauri::Manager;

fn main() {
    let _ = fix_path_env::fix();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            apply_saved_exiftool_dir(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            filestat,
            dir_entries_stat,
            discover_import_files,
            scan_import_preview,
            get_external_dependency_status,
            install_exiftool,
            set_exiftool_location,
            available_disk_space,
            download_model,
            cancel_model_download,
            generate_image_thumbnail,
            generate_image_preview,
            prepare_image_edit,
            preview_image_edit,
            clear_image_edit_preview,
            commit_image_edit,
            discard_image_edit,
            delete_asset_image_caches,
            perceptual_hash,
            sha256_file,
            sha256_file_prefix,
            copy_image_to_clipboard,
            open_file_with_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
