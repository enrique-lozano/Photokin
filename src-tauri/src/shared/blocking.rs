/// Run filesystem / CPU work off the async runtime. Join errors become `Err(String)`
/// so command handlers can `?` the result the same way as the inner work.
pub async fn run_blocking<T: Send + 'static>(
    task: &'static str,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("{task} task failed to run: {error}"))?
}
