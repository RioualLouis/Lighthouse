# Contributing to Lighthouse

## Setup

Install the requirements listed in the README (*Build from source*), then:

```bash
npm install      # Tauri CLI, Mermaid, test tools
npm run dev      # starts the app; the frontend reloads when a file in src/ changes
```

`npm run vendor` copies Mermaid from `node_modules` to `src/vendor/` (git-ignored). `dev` and `build` run it automatically.

## Project layout

| Path | Content |
|---|---|
| `src/` | Interface: plain HTML, CSS and JavaScript, no framework or bundler |
| `src/app.js` | Files, preview, zoom, tabs, PNG export |
| `src/editor.js` | Undo/redo history and editing commands |
| `src/theme.js` | Item colors: Mermaid theme variables, injected CSS, SVG post-processing |
| `src/help.js`, `src/templates.js`, `src/highlight.js` | Help pages, New-menu templates, syntax highlighting |
| `src-tauri/src/main.rs` | Tauri commands: dialogs, files, clipboard, PNG writing, window title, unsaved-changes prompts |
| `src-tauri/src/document.rs` | Finds the Mermaid block of a Markdown file and writes it back (``` and ~~~ fences, CRLF) |
| `src-tauri/src/config.rs` | Loads `config.toml`, merges it with the defaults, migrates old keys |
| `src-tauri/default-config.toml` | Default settings, embedded in the binary and copied for the user on first launch |
| `src-tauri/test-data/` | Fixtures of the Rust tests |
| `scripts/` | `vendor.mjs` (copy Mermaid), `check-frontend.mjs` (render checks) |
| `.github/` | CI, release workflow, issue and pull request templates |

## Checks

Run them before opening a pull request; CI runs the same ones on Linux and Windows.

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npx playwright install chromium   # once
npm run check                     # every template and help snippet must render
```

Interface changes cannot be tested automatically: try them in `npm run dev`, ideally on both systems. WebKitGTK (Linux) and WebView2 (Windows) render a few things differently, SVG text in particular.

## Conventions

- One feature or fix per pull request, with a short description of the user-visible effect.
- Code, comments and interface texts in English.
- Keep Linux and Windows on par: no feature for one system only. Use `std::path` in Rust, never hard-coded `/` or `\`.
- A new setting goes in `default-config.toml` (with a comment) **and** in the matching struct of `config.rs`. Renaming or removing a key needs an entry in `LEGACY_DIAGRAM_KEYS` (or an equivalent migration) so existing files keep loading.
- Any syntax or shortcut change is reflected in `src/help.js`.
- User-facing changes are listed in `CHANGELOG.md` under *Unreleased*.

## Adding a diagram type

1. `src/theme.js`: first keyword in `KINDS`, specific colors in `kindSpecific()`, legend in `LEGEND`.
2. `src/templates.js` and `src/index.html`: template and `data-template` entry of the New menu.
3. `src/help.js`: help page. Each snippet must render on its own after the `header` line (`npm run check` verifies it).
4. `src/highlight.js`: header keyword in `DIAGRAMS`, keywords in `KEYWORDS`; display name in `DIAGRAM_NAMES` (`src/app.js`).
5. New item type: table in `default-config.toml` and field in `Diagram` (`config.rs`).

## Releasing

1. Set the new version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Move the *Unreleased* entries of `CHANGELOG.md` under the new version.
3. Commit, then tag and push:
   ```bash
   git tag v1.4.0
   git push origin main v1.4.0
   ```
4. The *Release* workflow builds the `.deb`, the `.AppImage` and the Windows `.exe` installer and attaches them to a **draft** release. Check it, then publish it.
