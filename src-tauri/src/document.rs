//! Markdown handling: locating the Mermaid block of a file and writing the
//! edited diagram back without touching the rest of the document.

use std::path::Path;

/// How the edited code is written back to disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Template {
    /// The file had a fenced ```mermaid block: the surrounding text is kept.
    Fenced {
        prefix: String,
        open_fence: String,
        close_fence: String,
        suffix: String,
    },
    /// New document or raw Mermaid file (.mmd): no surrounding text.
    Raw,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Extracted {
    pub code: String,
    pub template: Template,
    pub crlf: bool,
    /// Human-readable remark shown in the status bar (multiple blocks, no block...).
    pub note: Option<String>,
}

struct Fence {
    marker: char,
    len: usize,
    mermaid: bool,
}

/// Recognises an opening code fence; `mermaid` tells whether its info string starts with `mermaid`.
fn opening_fence(line: &str) -> Option<Fence> {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    let indent = trimmed.len() - trimmed.trim_start_matches(' ').len();
    if indent > 3 {
        return None;
    }
    let rest = &trimmed[indent..];
    let marker = rest.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let len = rest.chars().take_while(|c| *c == marker).count();
    if len < 3 {
        return None;
    }
    let info = rest[len..].trim();
    if marker == '`' && info.contains('`') {
        return None; // inline code span, not a fence
    }
    let lang = info
        .split(|c: char| c.is_whitespace() || c == '{')
        .next()
        .unwrap_or("");
    Some(Fence {
        marker,
        len,
        mermaid: lang.eq_ignore_ascii_case("mermaid"),
    })
}

fn is_closing_fence(line: &str, fence: &Fence) -> bool {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    let indent = trimmed.len() - trimmed.trim_start_matches(' ').len();
    if indent > 3 {
        return false;
    }
    let rest = trimmed[indent..].trim_end();
    rest.chars().count() >= fence.len && rest.chars().all(|c| c == fence.marker)
}

fn is_markdown_ext(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "mkd")
    )
}

/// Extracts the first Mermaid block of `text`.
pub fn extract(text: &str, path: Option<&Path>) -> Extracted {
    let crlf = text.contains("\r\n");
    let lines: Vec<&str> = text.split_inclusive('\n').collect();

    let mut first: Option<(usize, usize, Option<usize>)> = None; // (open line, fence, close line)
    let mut blocks = 0usize;
    let mut i = 0;
    while i < lines.len() {
        if let Some(fence) = opening_fence(lines[i]) {
            let close = (i + 1..lines.len()).find(|&j| is_closing_fence(lines[j], &fence));
            if fence.mermaid {
                blocks += 1;
                if first.is_none() {
                    first = Some((i, fence.len, close));
                }
            }
            i = close.map_or(lines.len(), |c| c + 1);
        } else {
            i += 1;
        }
    }

    let Some((open, fence_len, close)) = first else {
        let note = path
            .filter(|p| is_markdown_ext(p))
            .filter(|_| !text.trim().is_empty())
            .map(|_| {
                "No ```mermaid block found: the whole file was loaded as diagram code.".to_string()
            });
        return Extracted {
            code: normalize(text),
            template: Template::Raw,
            crlf,
            note,
        };
    };

    let offset = |line: usize| lines[..line].iter().map(|l| l.len()).sum::<usize>();
    let open_start = offset(open);
    let code_start = offset(open + 1);
    let (code_end, close_fence, suffix_start) = match close {
        Some(c) => (offset(c), lines[c].to_string(), offset(c + 1)),
        None => {
            let indent: String = lines[open].chars().take_while(|c| *c == ' ').collect();
            let marker = lines[open].trim_start().chars().next().unwrap_or('`');
            let nl = if crlf { "\r\n" } else { "\n" };
            (
                text.len(),
                format!("{indent}{}{nl}", marker.to_string().repeat(fence_len)),
                text.len(),
            )
        }
    };

    let mut open_fence = lines[open].to_string();
    if !open_fence.ends_with('\n') {
        open_fence.push_str(if crlf { "\r\n" } else { "\n" });
    }

    let note = match (blocks, close) {
        (_, None) => Some(
            "The ```mermaid block is not closed: it was read until the end of the file."
                .to_string(),
        ),
        (n, _) if n > 1 => Some(format!(
            "{n} Mermaid blocks found: the first one is edited, the others are kept unchanged."
        )),
        _ => None,
    };

    Extracted {
        code: normalize(&text[code_start..code_end]),
        template: Template::Fenced {
            prefix: text[..open_start].to_string(),
            open_fence,
            close_fence,
            suffix: text[suffix_start..].to_string(),
        },
        crlf,
        note,
    }
}

/// Editor-side representation: `\n` newlines, no trailing newline.
fn normalize(code: &str) -> String {
    let mut s = code.replace("\r\n", "\n");
    while s.ends_with('\n') {
        s.pop();
    }
    s
}

/// Builds the file content for `code` according to `template` and the target file.
pub fn compose(template: &Template, code: &str, crlf: bool, target: &Path) -> String {
    let nl = if crlf { "\r\n" } else { "\n" };
    let mut body = normalize(code).replace('\n', nl);
    body.push_str(nl);
    match template {
        Template::Fenced {
            prefix,
            open_fence,
            close_fence,
            suffix,
        } => {
            format!("{prefix}{open_fence}{body}{close_fence}{suffix}")
        }
        Template::Raw if is_markdown_ext(target) => format!("```mermaid{nl}{body}```{nl}"),
        Template::Raw => body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str =
        "# Title\n\nIntro text.\n\n```mermaid\nclassDiagram\n  A <|-- B\n```\n\nOutro.\n";

    #[test]
    fn extracts_block_and_keeps_context() {
        let e = extract(DOC, Some(Path::new("a.md")));
        assert_eq!(e.code, "classDiagram\n  A <|-- B");
        assert!(e.note.is_none());
        let out = compose(&e.template, "classDiagram\n  C", e.crlf, Path::new("a.md"));
        assert_eq!(
            out,
            "# Title\n\nIntro text.\n\n```mermaid\nclassDiagram\n  C\n```\n\nOutro.\n"
        );
    }

    #[test]
    fn roundtrip_is_identity() {
        let e = extract(DOC, Some(Path::new("a.md")));
        assert_eq!(
            compose(&e.template, &e.code, e.crlf, Path::new("a.md")),
            DOC
        );
    }

    #[test]
    fn crlf_is_preserved() {
        let doc = DOC.replace('\n', "\r\n");
        let e = extract(&doc, Some(Path::new("a.md")));
        assert!(e.crlf);
        assert_eq!(e.code, "classDiagram\n  A <|-- B");
        assert_eq!(
            compose(&e.template, &e.code, e.crlf, Path::new("a.md")),
            doc
        );
    }

    #[test]
    fn tilde_fence_and_info_string() {
        let e = extract("~~~~ Mermaid title\nsequenceDiagram\n~~~~\n", None);
        assert_eq!(e.code, "sequenceDiagram");
    }

    #[test]
    fn ignores_other_languages_and_counts_blocks() {
        let doc = "```rust\nfn x() {}\n```\n```mermaid\nA\n```\n```mermaid\nB\n```\n";
        let e = extract(doc, Some(Path::new("x.md")));
        assert_eq!(e.code, "A");
        assert!(e.note.unwrap().starts_with("2 Mermaid blocks"));
        let out = compose(&e.template, "Z", false, Path::new("x.md"));
        assert_eq!(
            out,
            "```rust\nfn x() {}\n```\n```mermaid\nZ\n```\n```mermaid\nB\n```\n"
        );
    }

    #[test]
    fn mermaid_example_nested_in_other_fence_is_skipped() {
        let doc = "````markdown\n```mermaid\nX\n```\n````\n```mermaid\nY\n```\n";
        let e = extract(doc, Some(Path::new("x.md")));
        assert_eq!(e.code, "Y");
        assert!(e.note.is_none());
    }

    #[test]
    fn unclosed_block() {
        let e = extract("```mermaid\nclassDiagram\nclass A", None);
        assert_eq!(e.code, "classDiagram\nclass A");
        assert!(e.note.is_some());
        let out = compose(&e.template, &e.code, false, Path::new("x.md"));
        assert_eq!(out, "```mermaid\nclassDiagram\nclass A\n```\n");
    }

    #[test]
    fn raw_files() {
        let e = extract("classDiagram\nclass A\n", Some(Path::new("d.mmd")));
        assert_eq!(e.template, Template::Raw);
        assert!(e.note.is_none());
        assert_eq!(
            compose(&e.template, &e.code, false, Path::new("d.mmd")),
            "classDiagram\nclass A\n"
        );
        assert_eq!(
            compose(&e.template, &e.code, false, Path::new("d.md")),
            "```mermaid\nclassDiagram\nclass A\n```\n"
        );
    }

    #[test]
    fn markdown_without_block_gets_note() {
        let e = extract("just prose\n", Some(Path::new("n.md")));
        assert!(e.note.is_some());
    }
}
