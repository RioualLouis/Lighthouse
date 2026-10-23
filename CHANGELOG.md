# Changelog

All notable changes to Lighthouse. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

## [1.3.0] - 2026-10-23

### Added
- Windows 10/11 version with the same features as on Linux, distributed as an `.exe` installer (per-user, no administrator rights).
- Windows configuration file in `%APPDATA%\Lighthouse\config.toml`.
- Windows fonts (Segoe UI, Cascadia Mono, Consolas) in the default font lists.

### Changed
- Browser shortcuts of the Windows web engine (reload, print, find, zoom) are disabled so they cannot interfere with the editor.
- Build scripts work on both systems.

## [1.2.0] - 2026-10-23

### Added
- Help tab (F1) for the current diagram type: syntax, snippets to insert, color legend, keyboard shortcuts.
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) and line commands: comment, duplicate, delete, move.

### Changed
- One color per item type (class, interface, abstract class, enumeration, actor, note, activation, decision, container), shared by all diagram types, instead of one color per diagram type. Settings move to the `[diagram.*]` tables; files written by 1.0 and 1.1 keep loading.

### Fixed
- The current-line highlight drifted down from the text on long files.
- Sequence actor names overlapped the stick figures on Linux.

## [1.1.0] - 2026-10-23

### Added
- Use case, state and activity diagrams, with templates.

## [1.0.0] - 2026-10-23

### Added
- Mermaid editor with syntax highlighting and live preview of class and sequence diagrams.
- Open and save Markdown files, copy the code, export PNG.
- Colors and fonts set in `config.toml`.
- Linux `.deb` and `.AppImage` packages.
