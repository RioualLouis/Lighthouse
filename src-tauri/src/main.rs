// Prevents an extra console window on Windows release builds (harmless on Linux).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod document;

use base64::Engine as _;
use document::Template;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const APP_NAME: &str = "Lighthouse";
const MAIN_WINDOW: &str = "main";

/// State of the document currently being edited.
struct DocState {
    path: Option<PathBuf>,
    template: Template,
    crlf: bool,
    dirty: bool,
}

impl Default for DocState {
    fn default() -> Self {
        Self {
            path: None,
            template: Template::Raw,
            crlf: false,
            dirty: false,
        }
    }
}

struct AppState {
    doc: Mutex<DocState>,
    /// File passed on the command line, consumed by the first `initial_document` call.
    startup_file: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
struct OpenedDoc {
    path: String,
    name: String,
    code: String,
    note: Option<String>,
}

#[derive(Serialize)]
struct SavedDoc {
    path: String,
    name: String,
}

type CmdResult<T> = Result<T, String>;

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn update_title(app: &AppHandle) {
    let state = app.state::<AppState>();
    let doc = state.doc.lock().unwrap();
    let name = doc
        .path
        .as_deref()
        .map(file_name)
        .unwrap_or_else(|| "Untitled".into());
    let mark = if doc.dirty { "\u{2022} " } else { "" };
    if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
        let _ = w.set_title(&format!("{mark}{name} - {APP_NAME}"));
    }
}

fn current_dir(app: &AppHandle) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    let doc = state.doc.lock().unwrap();
    doc.path
        .as_ref()
        .and_then(|p| p.parent().map(Path::to_path_buf))
}

fn current_stem(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let doc = state.doc.lock().unwrap();
    doc.path
        .as_ref()
        .and_then(|p| p.file_stem())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "diagram".into())
}

/// Appends `ext` when the chosen file name has no extension.
fn with_extension(mut path: PathBuf, ext: &str) -> PathBuf {
    if path.extension().is_none() {
        path.set_extension(ext);
    }
    path
}

fn read_document(app: &AppHandle, path: PathBuf) -> CmdResult<OpenedDoc> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| format!("{} is not a UTF-8 text file.", path.display()))?;
    let extracted = document::extract(&text, Some(&path));
    {
        let state = app.state::<AppState>();
        let mut doc = state.doc.lock().unwrap();
        *doc = DocState {
            path: Some(path.clone()),
            template: extracted.template,
            crlf: extracted.crlf,
            dirty: false,
        };
    }
    update_title(app);
    Ok(OpenedDoc {
        name: file_name(&path),
        path: path.display().to_string(),
        code: extracted.code,
        note: extracted.note,
    })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_config() -> config::LoadedConfig {
    config::load()
}

#[tauri::command]
fn initial_document(app: AppHandle) -> CmdResult<Option<OpenedDoc>> {
    let startup = app.state::<AppState>().startup_file.lock().unwrap().take();
    match startup {
        Some(path) => read_document(&app, path).map(Some),
        None => {
            update_title(&app);
            Ok(None)
        }
    }
}

#[tauri::command]
fn new_document(app: AppHandle) {
    *app.state::<AppState>().doc.lock().unwrap() = DocState::default();
    update_title(&app);
}

#[tauri::command]
fn set_dirty(app: AppHandle, dirty: bool) {
    let changed = {
        let state = app.state::<AppState>();
        let mut doc = state.doc.lock().unwrap();
        std::mem::replace(&mut doc.dirty, dirty) != dirty
    };
    if changed {
        update_title(&app);
    }
}

/// Asks before discarding unsaved changes. Returns true when it is fine to continue.
#[tauri::command]
async fn confirm_discard(app: AppHandle) -> bool {
    if !app.state::<AppState>().doc.lock().unwrap().dirty {
        return true;
    }
    app.dialog()
        .message("The current diagram has unsaved changes. Discard them?")
        .title(APP_NAME)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Discard".into(),
            "Cancel".into(),
        ))
        .blocking_show()
}

#[tauri::command]
async fn open_markdown(app: AppHandle) -> CmdResult<Option<OpenedDoc>> {
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Open a Markdown file")
        .add_filter("Markdown / Mermaid", &["md", "markdown", "mmd", "mermaid"])
        .add_filter("All files", &["*"]);
    if let Some(dir) = current_dir(&app) {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    read_document(&app, path).map(Some)
}

#[tauri::command]
async fn save_markdown(app: AppHandle, code: String, save_as: bool) -> CmdResult<Option<SavedDoc>> {
    let known = app.state::<AppState>().doc.lock().unwrap().path.clone();
    let target = match known {
        Some(p) if !save_as => p,
        _ => {
            let mut dialog = app
                .dialog()
                .file()
                .set_title("Save as Markdown")
                .add_filter("Markdown", &["md"])
                .set_file_name(format!("{}.md", current_stem(&app)));
            if let Some(dir) = current_dir(&app) {
                dialog = dialog.set_directory(dir);
            }
            let Some(picked) = dialog.blocking_save_file() else {
                return Ok(None);
            };
            with_extension(picked.into_path().map_err(|e| e.to_string())?, "md")
        }
    };

    let content = {
        let state = app.state::<AppState>();
        let doc = state.doc.lock().unwrap();
        document::compose(&doc.template, &code, doc.crlf, &target)
    };
    std::fs::write(&target, content)
        .map_err(|e| format!("Cannot write {}: {e}", target.display()))?;

    {
        let state = app.state::<AppState>();
        let mut doc = state.doc.lock().unwrap();
        doc.path = Some(target.clone());
        doc.dirty = false;
    }
    update_title(&app);
    Ok(Some(SavedDoc {
        name: file_name(&target),
        path: target.display().to_string(),
    }))
}

#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> CmdResult<()> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Wraps the code in a ```mermaid fence, as it would be written to a .md file.
#[tauri::command]
fn markdown_block(code: String) -> String {
    document::compose(&Template::Raw, &code, false, Path::new("x.md"))
}

#[tauri::command]
async fn export_png(app: AppHandle, data: String) -> CmdResult<Option<String>> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("Invalid image data: {e}"))?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("The rendered image is not a PNG.".into());
    }
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Export diagram as PNG")
        .add_filter("PNG image", &["png"])
        .set_file_name(format!("{}.png", current_stem(&app)));
    if let Some(dir) = current_dir(&app) {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let target = with_extension(picked.into_path().map_err(|e| e.to_string())?, "png");
    std::fs::write(&target, bytes)
        .map_err(|e| format!("Cannot write {}: {e}", target.display()))?;
    Ok(Some(target.display().to_string()))
}

/// WebView2 handles browser shortcuts (F5 / Ctrl+R reload, Ctrl+P print,
/// Ctrl+F find, Ctrl+Plus zoom...) before the page sees some of them. They make
/// no sense in Lighthouse and some collide with its own shortcuts. Editing keys
/// (Ctrl+C, Ctrl+V, Ctrl+Z...) are not affected.
#[cfg(windows)]
fn disable_browser_shortcuts(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else {
            return;
        };
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

fn main() {
    let startup_file = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| p.is_file())
        .map(|p| std::fs::canonicalize(&p).unwrap_or(p));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                disable_browser_shortcuts(&window);
            }
            #[cfg(not(windows))]
            let _ = app;
            Ok(())
        })
        .manage(AppState {
            doc: Mutex::new(DocState::default()),
            startup_file: Mutex::new(startup_file),
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if !app.state::<AppState>().doc.lock().unwrap().dirty {
                    return;
                }
                api.prevent_close();
                let window = window.clone();
                app.dialog()
                    .message("The current diagram has unsaved changes. Quit anyway?")
                    .title(APP_NAME)
                    .kind(MessageDialogKind::Warning)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Quit".into(),
                        "Cancel".into(),
                    ))
                    .show(move |quit| {
                        if quit {
                            let _ = window.destroy();
                        }
                    });
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            initial_document,
            new_document,
            set_dirty,
            confirm_discard,
            open_markdown,
            save_markdown,
            copy_text,
            markdown_block,
            export_png
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lighthouse");
}
