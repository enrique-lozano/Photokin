use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalDependencyStatus {
    id: String,
    display_name: String,
    version: Option<String>,
    location: Option<String>,
    available: bool,
    error: Option<String>,
    recommended_version: Option<String>,
}

fn first_non_empty_line(content: &[u8]) -> Option<String> {
    String::from_utf8_lossy(content)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(ToString::to_string)
}

fn command_output(program: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to execute `{program}`: {error}"))
}

fn resolve_command_location(binary: &str) -> Option<String> {
    let lookup_command = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    command_output(lookup_command, &[binary])
        .ok()
        .and_then(|output| {
            output
                .status
                .success()
                .then(|| first_non_empty_line(&output.stdout))
                .flatten()
        })
}

fn inspect_external_dependency(
    id: &str,
    display_name: &str,
    command: &str,
    version_args: &[&str],
) -> ExternalDependencyStatus {
    let location = resolve_command_location(command);

    match command_output(command, version_args) {
        Ok(output) if output.status.success() => ExternalDependencyStatus {
            id: id.to_string(),
            display_name: display_name.to_string(),
            version: first_non_empty_line(&output.stdout)
                .or_else(|| first_non_empty_line(&output.stderr)),
            location,
            available: true,
            error: None,
            recommended_version: None,
        },
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let error = if !stderr.is_empty() {
                stderr
            } else if stdout.is_empty() {
                format!("Exited with code {:?}", output.status.code())
            } else {
                stdout
            };

            ExternalDependencyStatus {
                id: id.to_string(),
                display_name: display_name.to_string(),
                version: None,
                location,
                available: false,
                error: Some(error),
                recommended_version: None,
            }
        }
        Err(error) => ExternalDependencyStatus {
            id: id.to_string(),
            display_name: display_name.to_string(),
            version: None,
            location,
            available: false,
            error: Some(error),
            recommended_version: None,
        },
    }
}

#[tauri::command]
pub fn get_external_dependency_status() -> Vec<ExternalDependencyStatus> {
    let mut status = inspect_external_dependency("exiftool", "ExifTool", "exiftool", &["-ver"]);
    status.recommended_version = Some(super::exiftool_setup::MANAGED_VERSION.to_string());
    vec![status]
}

#[cfg(test)]
#[path = "../tests/dependency_status.rs"]
mod tests;
