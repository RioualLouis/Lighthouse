// Lightweight Mermaid syntax highlighter for the editor overlay.
// Produces HTML spans (t-diagram, t-keyword, t-arrow, t-string, t-label,
// t-member, t-comment, t-punct) whose colors come from config.toml.
'use strict';

(function () {
  const DIAGRAMS = new Set([
    'classDiagram', 'classDiagram-v2', 'sequenceDiagram', 'flowchart', 'graph',
    'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'journey',
    'gitGraph', 'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram',
    'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
    'sankey-beta', 'sankey', 'xychart-beta', 'xychart', 'block-beta', 'block',
    'packet-beta', 'packet', 'kanban', 'architecture-beta', 'architecture',
    'radar-beta', 'treemap-beta', 'treemap', 'zenuml', 'usecase-beta', 'swimlane-beta',
  ]);

  const KEYWORDS = new RegExp('(?:' + [
    'left of', 'right of', 'participant', 'actor', 'boundary', 'control', 'entity',
    'database', 'collections', 'queue', 'class', 'namespace', 'interface', 'note',
    'Note', 'over', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'option',
    'break', 'rect', 'end', 'activate', 'deactivate', 'autonumber', 'title',
    'direction', 'box', 'create', 'destroy', 'link', 'links', 'callback', 'click',
    'style', 'classDef', 'cssClass', 'accTitle', 'accDescr', 'as', 'subgraph',
    'state', 'section', 'systemBoundary', 'TB', 'TD', 'BT', 'LR', 'RL',
  ].join('|') + ')(?![\\w-])', 'y');

  const ARROW = /(?<![\w])[*o](?:--|\.\.)|<<-{1,2}>>|<\|(?:--|\.\.)|<(?:--|\.\.)|-{1,2}(?:>>|>|x(?!\w)|\)|\|>|\*|o(?!\w))[+-]?|\.\.(?:\|>|>)|-\.+->?|={2,3}>?|-{2,3}|\.\./y;
  const STRING = /"[^"]*"?/y;
  const STEREOTYPE = /<<[^>\n]*>>/y;
  const WORD = /[A-Za-z_$][\w$]*/y;
  const PUNCT = /[{}()[\]<>~,;|]/y;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return text ? `<span class="t-${cls}">${esc(text)}</span>` : '';
  }

  function at(re, src, i) {
    re.lastIndex = i;
    const m = re.exec(src);
    return m ? m[0] : null;
  }

  // Node metadata such as `@{ shape: fork }`.
  function metadata(text) {
    const closed = text.endsWith('}');
    const inner = text.slice(2, closed ? -1 : undefined);
    let out = span('punct', '@{');
    for (const part of inner.split(/(,)/)) {
      if (part === ',') { out += span('punct', ','); continue; }
      const c = part.indexOf(':');
      out += c === -1 ? esc(part) : span('member', part.slice(0, c)) + span('punct', ':') + span('string', part.slice(c + 1));
    }
    return out + (closed ? span('punct', '}') : '');
  }

  // Class attribute / method line: generics and brackets dimmed.
  function member(src) {
    return src.replace(/([^~()[\]{}<>,]+)|([~()[\]{}<>,]+)/g, (_, text, punct) =>
      text ? span('member', text) : span('punct', punct));
  }

  function statement(src, st) {
    let out = '';
    let i = 0;
    let sawArrow = false;
    while (i < src.length) {
      const ch = src[i];
      let tok;
      if (ch === ' ' || ch === '\t') {
        const j = src.slice(i).search(/[^ \t]/);
        tok = j === -1 ? src.slice(i) : src.slice(i, i + j);
        out += tok;
        i += tok.length;
        continue;
      }
      if (src.startsWith('[*]', i)) { out += span('keyword', '[*]'); i += 3; continue; }
      if (src.startsWith('@{', i)) {
        const close = src.indexOf('}', i);
        const end = close === -1 ? src.length : close + 1;
        out += metadata(src.slice(i, end));
        i = end;
        continue;
      }
      if ((tok = at(STRING, src, i))) { out += span('string', tok); i += tok.length; continue; }
      if ((tok = at(STEREOTYPE, src, i))) { out += span('keyword', tok); i += tok.length; continue; }
      if ((tok = at(ARROW, src, i))) { out += span('arrow', tok); i += tok.length; sawArrow = true; continue; }
      if (ch === ':') {
        const rest = src.slice(i + 1);
        const relation = st.type === 'usecase-beta' && /^(\s*)(include|extend)\b/i.exec(rest);
        if (relation) {
          out += span('punct', ':') + esc(relation[1]) + span('keyword', relation[2]);
          i += 1 + relation[0].length;
          continue;
        }
        const isMember = st.type.startsWith('classDiagram') && !sawArrow;
        out += span('punct', ':') + (isMember ? member(rest) : span('label', rest));
        break;
      }
      if ((tok = at(KEYWORDS, src, i)) && (i === 0 || !/[\w-]/.test(src[i - 1]))) {
        out += span('keyword', tok); i += tok.length; continue;
      }
      if ((tok = at(WORD, src, i))) { out += esc(tok); i += tok.length; continue; }
      if ((tok = at(PUNCT, src, i))) {
        out += span('punct', tok);
        if (tok === '{' && st.type.startsWith('classDiagram')) st.depth++;
        if (tok === '}' && st.depth > 0) st.depth--;
        i += 1;
        continue;
      }
      out += esc(ch);
      i += 1;
    }
    return out;
  }

  function line(src, st) {
    const trimmed = src.trim();
    if (st.frontmatter) {
      if (trimmed === '---') st.frontmatter = false;
      return span('punct', src);
    }
    if (!st.started && trimmed === '---') {
      st.frontmatter = true;
      return span('punct', src);
    }
    if (trimmed.startsWith('%%')) return span('comment', src);
    if (!trimmed) return esc(src);

    if (!st.started) {
      st.started = true;
      const m = /^(\s*)([A-Za-z][\w-]*)(.*)$/.exec(src);
      if (m && DIAGRAMS.has(m[2])) {
        st.type = m[2];
        return esc(m[1]) + span('diagram', m[2]) + statement(m[3], st);
      }
    }

    if (st.depth > 0) {
      const close = src.indexOf('}');
      if (close === -1) return member(src);
      st.depth--;
      return member(src.slice(0, close)) + span('punct', '}') + statement(src.slice(close + 1), st);
    }
    return statement(src, st);
  }

  function render(text) {
    const st = { started: false, frontmatter: false, type: '', depth: 0 };
    return text.split('\n').map((l) => line(l, st)).join('\n');
  }

  window.LighthouseHighlight = { render };
})();
