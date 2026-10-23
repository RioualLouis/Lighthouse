//! User configuration: colors, fonts and export settings, stored as TOML.
//!
//! The built-in defaults live in `default-config.toml` (embedded at compile time).
//! A user file only needs the keys it changes: it is merged over the defaults
//! before being validated against the typed structures below.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

pub const DEFAULT_CONFIG: &str = include_str!("../default-config.toml");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub ui: Ui,
    pub editor: Editor,
    pub preview: Preview,
    pub diagram: Diagram,
    pub export: Export,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ui {
    pub font_family: String,
    pub font_size: f64,
    pub background: String,
    pub border: String,
    pub text: String,
    pub text_muted: String,
    pub hover: String,
    pub accent: String,
    pub accent_hover: String,
    pub accent_text: String,
    pub success: String,
    pub error: String,
    pub radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Editor {
    pub font_family: String,
    pub font_size: f64,
    pub line_height: f64,
    pub tab_size: u8,
    pub render_delay_ms: u32,
    pub background: String,
    pub text: String,
    pub gutter_text: String,
    pub current_line: String,
    pub selection: String,
    pub error_line: String,
    pub syntax: Syntax,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Syntax {
    pub diagram: String,
    pub keyword: String,
    pub arrow: String,
    pub string: String,
    pub label: String,
    pub member: String,
    pub comment: String,
    pub punctuation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preview {
    pub background: String,
    pub grid: bool,
    pub grid_color: String,
    pub max_auto_zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Diagram {
    pub font_family: String,
    pub font_size: f64,
    pub look: String,
    pub text: String,
    pub line: String,
    pub edge_label_background: String,
    pub terminal: String,
    pub lifeline: String,
    pub message: String,
    pub message_text: String,
    pub sequence_number: String,
    pub include_line: String,
    pub extend_line: String,
    pub secondary: String,
    pub tertiary: String,
    pub element: Item,
    pub interface: Item,
    #[serde(rename = "abstract")]
    pub abstract_class: Item,
    pub enumeration: Item,
    pub actor: Item,
    pub note: Item,
    pub activation: Item,
    pub decision: Item,
    pub container: Container,
    #[serde(default)]
    pub overrides: BTreeMap<String, String>,
}

/// Colors of one item type (class, actor, note...).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub fill: String,
    pub border: String,
    pub text: String,
}

/// Colors of grouping items (namespace, loop block, system boundary, composite state...).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Container {
    pub fill: String,
    pub header: String,
    pub border: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Export {
    pub png_scale: f64,
    pub png_padding: f64,
    pub png_background: String,
}

/// Result handed to the interface: the effective configuration, where it
/// comes from, and an optional warning when the user file was rejected.
#[derive(Debug, Clone, Serialize)]
pub struct LoadedConfig {
    pub config: Config,
    pub path: Option<String>,
    pub warning: Option<String>,
}

fn non_empty_var(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// Windows: `%APPDATA%\Lighthouse\config.toml`.
#[cfg(windows)]
pub fn config_path() -> Option<PathBuf> {
    Some(
        non_empty_var("APPDATA")?
            .join("Lighthouse")
            .join("config.toml"),
    )
}

/// Linux: `$XDG_CONFIG_HOME/lighthouse/config.toml`, falling back to `~/.config`.
#[cfg(not(windows))]
pub fn config_path() -> Option<PathBuf> {
    let base = non_empty_var("XDG_CONFIG_HOME")
        .or_else(|| non_empty_var("HOME").map(|h| h.join(".config")))?;
    Some(base.join("lighthouse").join("config.toml"))
}

fn defaults_table() -> toml::Table {
    toml::from_str(DEFAULT_CONFIG).expect("embedded default-config.toml is valid TOML")
}

/// Recursively writes the keys of `overlay` into `base`.
fn merge(base: &mut toml::Table, overlay: toml::Table) {
    for (key, value) in overlay {
        match (base.get_mut(&key), value) {
            (Some(toml::Value::Table(b)), toml::Value::Table(o)) => merge(b, o),
            (_, v) => {
                base.insert(key, v);
            }
        }
    }
}

fn into_config(table: toml::Table) -> Result<Config, String> {
    toml::Value::Table(table)
        .try_into::<Config>()
        .map_err(|e| e.to_string().trim().to_string())
}

pub fn default_config() -> Config {
    into_config(defaults_table()).expect("embedded default-config.toml matches Config")
}

/// `[diagram]` keys of Lighthouse 1.0 and 1.1, with their default value and,
/// when it has a clear equivalent, the key that replaces them (`table.key`).
const LEGACY_DIAGRAM_KEYS: &[(&str, &str, Option<&str>)] = &[
    ("class_fill", "#E8F1FF", Some("element.fill")),
    ("class_border", "#0A66FF", Some("element.border")),
    ("class_text", "#0B1A3A", Some("element.text")),
    ("actor_fill", "#0A66FF", None),
    ("actor_border", "#0047C2", None),
    ("actor_text", "#FFFFFF", None),
    ("note_fill", "#FFF4B8", Some("note.fill")),
    ("note_border", "#FFB300", Some("note.border")),
    ("note_text", "#3B2A00", Some("note.text")),
    ("activation_fill", "#D9FFEA", Some("activation.fill")),
    ("activation_border", "#00B35A", Some("activation.border")),
    ("block_fill", "#F6E8FF", Some("container.header")),
    ("block_border", "#AA00FF", Some("container.border")),
    ("block_text", "#6A00C9", Some("container.text")),
    ("usecase_fill", "#F3E5FF", None),
    ("usecase_border", "#A100FF", None),
    ("usecase_text", "#2A0047", None),
    ("usecase_actor", "#0A66FF", Some("actor.border")),
    ("boundary_fill", "#FFFFFF", None),
    ("boundary_border", "#8592AA", None),
    ("state_fill", "#DFFFEF", None),
    ("state_border", "#00B35A", None),
    ("state_text", "#003D1F", None),
    ("composite_fill", "#FFFFFF", None),
    ("composite_title_fill", "#B8F5D6", None),
    ("state_terminal", "#0F172A", Some("terminal")),
    ("action_fill", "#FFF0DE", None),
    ("action_border", "#FF7A00", None),
    ("action_text", "#3D1D00", None),
    ("decision_fill", "#FFF6B3", Some("decision.fill")),
    ("decision_border", "#FFB300", Some("decision.border")),
    ("activity_terminal", "#0F172A", Some("terminal")),
];

/// Keys still in use whose default changed: an old untouched value is dropped.
const CHANGED_DEFAULTS: &[(&str, &str)] =
    &[("include_line", "#0A66FF"), ("extend_line", "#FF6D00")];

fn same_color(a: &toml::Value, b: &str) -> bool {
    a.as_str().is_some_and(|a| a.trim().eq_ignore_ascii_case(b))
}

/// Upgrades the `[diagram]` table of a configuration written by an older
/// version. Keys left at their old default are dropped silently, customized
/// ones are moved to their new location when there is one. Returns the
/// customized keys that had to be ignored.
fn migrate_legacy(user: &mut toml::Table) -> Vec<String> {
    let Some(toml::Value::Table(diagram)) = user.get_mut("diagram") else {
        return Vec::new();
    };
    for (key, old_default) in CHANGED_DEFAULTS {
        if diagram
            .get(*key)
            .is_some_and(|v| same_color(v, old_default))
        {
            diagram.remove(*key);
        }
    }
    let mut ignored = Vec::new();
    for (key, old_default, target) in LEGACY_DIAGRAM_KEYS {
        let Some(value) = diagram.remove(*key) else {
            continue;
        };
        if same_color(&value, old_default) {
            continue;
        }
        let placed = match target.map(|t| t.split_once('.')) {
            Some(Some((table, field))) => {
                let entry = diagram
                    .entry(table.to_string())
                    .or_insert_with(|| toml::Value::Table(toml::Table::new()));
                match entry {
                    toml::Value::Table(t) if !t.contains_key(field) => {
                        t.insert(field.to_string(), value);
                        true
                    }
                    _ => false,
                }
            }
            Some(None) => {
                let field = target.unwrap();
                if diagram.contains_key(field) {
                    false
                } else {
                    diagram.insert(field.to_string(), value);
                    true
                }
            }
            None => false,
        };
        if !placed {
            ignored.push(format!("diagram.{key}"));
        }
    }
    ignored
}

/// Parses user TOML text over the defaults. Also returns the obsolete keys
/// that were ignored.
pub fn parse_user_config(text: &str) -> Result<(Config, Vec<String>), String> {
    let mut user: toml::Table =
        toml::from_str(text).map_err(|e| e.to_string().trim().to_string())?;
    let ignored = migrate_legacy(&mut user);
    let mut table = defaults_table();
    merge(&mut table, user);
    into_config(table).map(|c| (c, ignored))
}

/// Loads the user configuration, creating it with the commented defaults on
/// first launch. Never fails: problems are reported through `warning`.
pub fn load() -> LoadedConfig {
    let Some(path) = config_path() else {
        return LoadedConfig {
            config: default_config(),
            path: None,
            warning: Some(
                "No user configuration folder found: using the built-in configuration.".into(),
            ),
        };
    };
    let shown = path.display().to_string();

    if !path.exists() {
        let created = path
            .parent()
            .map(std::fs::create_dir_all)
            .transpose()
            .and_then(|_| std::fs::write(&path, DEFAULT_CONFIG));
        return LoadedConfig {
            config: default_config(),
            path: Some(shown.clone()),
            warning: created
                .err()
                .map(|e| format!("Could not create {shown}: {e}")),
        };
    }

    match std::fs::read_to_string(&path) {
        Ok(text) => match parse_user_config(&text) {
            Ok((config, ignored)) => LoadedConfig {
                config,
                warning: (!ignored.is_empty()).then(|| {
                    format!(
                        "Obsolete settings ignored in {shown}: {}. Colors are now set per item type in the [diagram.*] tables.",
                        ignored.join(", ")
                    )
                }),
                path: Some(shown),
            },
            Err(e) => LoadedConfig {
                config: default_config(),
                path: Some(shown.clone()),
                warning: Some(format!("{shown} ignored, using defaults. {e}")),
            },
        },
        Err(e) => LoadedConfig {
            config: default_config(),
            path: Some(shown.clone()),
            warning: Some(format!("Could not read {shown}: {e}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let c = default_config();
        assert_eq!(c.ui.background, "#FFFFFF");
        assert!(c.diagram.overrides.is_empty());
    }

    fn parse(text: &str) -> Config {
        let (config, ignored) = parse_user_config(text).unwrap();
        assert!(ignored.is_empty(), "{ignored:?}");
        config
    }

    #[test]
    fn partial_user_file_is_merged() {
        let c = parse("[ui]\naccent = \"#FF0000\"\n[diagram.overrides]\nfoo = \"bar\"\n");
        assert_eq!(c.ui.accent, "#FF0000");
        assert_eq!(c.ui.background, "#FFFFFF");
        assert_eq!(
            c.diagram.overrides.get("foo").map(String::as_str),
            Some("bar")
        );
    }

    #[test]
    fn item_tables_are_merged_per_key() {
        let c =
            parse("[diagram.note]\nfill = \"#00FF00\"\n[diagram.abstract]\nborder = \"#123456\"\n");
        assert_eq!(c.diagram.note.fill, "#00FF00");
        assert_eq!(c.diagram.note.border, "#FFB300");
        assert_eq!(c.diagram.abstract_class.border, "#123456");
    }

    #[test]
    fn untouched_legacy_file_loads_with_new_defaults() {
        let c = parse(include_str!("../test-data/config-1.1.toml"));
        let d = default_config().diagram;
        assert_eq!(c.diagram.element.fill, d.element.fill);
        assert_eq!(c.diagram.actor.border, d.actor.border);
        assert_eq!(c.diagram.include_line, d.include_line);
        assert_eq!(c.diagram.extend_line, d.extend_line);
    }

    #[test]
    fn customized_legacy_keys_are_moved_or_reported() {
        let text = include_str!("../test-data/config-1.1.toml")
            .replace("note_fill = \"#FFF4B8\"", "note_fill = \"#ABCDEF\"")
            .replace("state_fill = \"#DFFFEF\"", "state_fill = \"#000001\"");
        let (c, ignored) = parse_user_config(&text).unwrap();
        assert_eq!(c.diagram.note.fill, "#ABCDEF");
        assert_eq!(ignored, vec!["diagram.state_fill".to_string()]);
    }

    #[test]
    fn unknown_keys_are_rejected() {
        let err = parse_user_config("[ui]\naccnt = \"#FF0000\"\n").unwrap_err();
        assert!(err.contains("accnt"), "{err}");
    }

    #[test]
    fn wrong_types_are_rejected() {
        assert!(parse_user_config("[editor]\ntab_size = \"four\"\n").is_err());
    }
}
