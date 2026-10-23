// Lighthouse interface logic. File access, dialogs, clipboard and
// configuration are handled by the Rust backend through `invoke`.
'use strict';

const { invoke } = window.__TAURI__.core;

const DIAGRAM_NAMES = {
  classDiagram: 'Class diagram', 'classDiagram-v2': 'Class diagram',
  sequenceDiagram: 'Sequence diagram', 'usecase-beta': 'Use case diagram',
  flowchart: 'Activity diagram', graph: 'Activity diagram', 'swimlane-beta': 'Activity diagram',
  stateDiagram: 'State diagram', 'stateDiagram-v2': 'State diagram',
  erDiagram: 'Entity relationship', gantt: 'Gantt chart', pie: 'Pie chart',
  journey: 'User journey', gitGraph: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline',
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const $ = (id) => document.getElementById(id);

const els = {
  source: $('source'), highlight: $('highlight'), gutter: $('gutter-inner'),
  markCurrent: $('mark-current'), markError: $('mark-error'), codeArea: $('code-area'),
  viewport: $('viewport'), stage: $('stage'), empty: $('empty'),
  errorBanner: $('error-banner'), errorText: $('error-text'),
  zoomReset: $('zoom-reset'), zoomFit: $('zoom-fit'),
  status: $('status'), cursor: $('cursor'), toast: $('toast'),
  docName: $('doc-name'), dirtyDot: $('dirty-dot'), diagramType: $('diagram-type'),
  workspace: $('workspace'), splitter: $('splitter'),
  menuNew: $('menu-new'), menuCopy: $('menu-copy'),
  previewPane: $('preview-pane'), help: $('help'), tabPreview: $('tab-preview'), tabHelp: $('tab-help'),
};

const state = {
  config: null,
  mermaidKind: null,     // kind the Mermaid theme was last initialized for
  savedCode: '',
  dirty: false,
  renderSeq: 0,
  renderTimer: null,
  hasDiagram: false,     // a diagram is displayed
  valid: false,          // the displayed diagram matches the current code
  errorLine: null,
  lineCount: 0,
  currentLine: 1,
  view: { x: 0, y: 0, s: 1 },
  size: { w: 0, h: 0 },
  autoFit: true,
  tab: 'preview',        // 'preview' or 'help'
  helpKey: null,         // kind and config the help panel was rendered for
};

// ------------------------------------------------------------------ theme

function currentKind(code = els.source.value) {
  return window.LighthouseTheme.kindOf(detectDiagram(code));
}

/** Re-initializes Mermaid when the diagram family changes. */
function prepareMermaid(kind) {
  if (kind !== state.mermaidKind) {
    mermaid.initialize(window.LighthouseTheme.mermaidConfig(state.config, kind));
    state.mermaidKind = kind;
  }
}

function applyTheme(cfg) {
  const root = document.documentElement.style;
  const vars = {
    '--ui-font': cfg.ui.font_family,
    '--ui-font-size': `${cfg.ui.font_size}px`,
    '--bg': cfg.ui.background,
    '--border': cfg.ui.border,
    '--text': cfg.ui.text,
    '--text-muted': cfg.ui.text_muted,
    '--hover': cfg.ui.hover,
    '--accent': cfg.ui.accent,
    '--accent-hover': cfg.ui.accent_hover,
    '--accent-text': cfg.ui.accent_text,
    '--success': cfg.ui.success,
    '--error': cfg.ui.error,
    '--radius': `${cfg.ui.radius}px`,
    '--editor-font': cfg.editor.font_family,
    '--editor-font-size': `${cfg.editor.font_size}px`,
    // Whole pixels: fractional line heights are rounded differently by the
    // textarea and the overlays, which made the line marks drift.
    '--editor-line-height': `${Math.max(1, Math.round(cfg.editor.font_size * cfg.editor.line_height))}px`,
    '--editor-bg': cfg.editor.background,
    '--editor-text': cfg.editor.text,
    '--gutter-text': cfg.editor.gutter_text,
    '--current-line': cfg.editor.current_line,
    '--selection': cfg.editor.selection,
    '--error-line': cfg.editor.error_line,
    '--tab-size': String(cfg.editor.tab_size),
    '--preview-bg': cfg.preview.background,
    '--grid-color': cfg.preview.grid_color,
  };
  for (const [key, color] of Object.entries(cfg.editor.syntax)) {
    vars[`--syn-${key === 'punctuation' ? 'punct' : key}`] = color;
  }
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  els.viewport.classList.toggle('grid', cfg.preview.grid);
  state.mermaidKind = null; // force a Mermaid re-initialization on next render
}

async function reloadConfig(announce) {
  const loaded = await invoke('load_config');
  state.config = loaded.config;
  state.helpKey = null;
  applyTheme(loaded.config);
  updateEditorDecorations();
  if (loaded.warning) {
    toast(loaded.warning, true, 9000);
  } else if (announce) {
    toast(`Configuration reloaded from ${loaded.path ?? 'defaults'}`);
  }
  renderNow();
}

// ----------------------------------------------------------------- status

let toastTimer = null;

function toast(message, isError = false, ms = 2600) {
  const icon = isError
    ? '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
  els.toast.innerHTML = icon;
  els.toast.append(document.createTextNode(message));
  els.toast.classList.toggle('error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function setStatus(kind, text) {
  els.status.className = `status ${kind}`;
  els.status.textContent = text;
  els.status.title = text;
}

function errorMessage(err) {
  if (typeof err === 'string') return err;
  return err?.message ?? String(err);
}

// ----------------------------------------------------------------- editor

function lineMetrics() {
  const cs = getComputedStyle(els.source);
  return { lh: parseFloat(cs.lineHeight), pad: parseFloat(cs.paddingTop) };
}

function updateHighlight() {
  // The trailing newline keeps the last empty line the same height as in the textarea.
  els.highlight.innerHTML = window.LighthouseHighlight.render(els.source.value) + '\n';
}

function updateGutter() {
  const count = els.source.value.split('\n').length;
  if (count !== state.lineCount) {
    state.lineCount = count;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
      const div = document.createElement('div');
      div.textContent = i;
      frag.append(div);
    }
    els.gutter.replaceChildren(frag);
  }
  const rows = els.gutter.children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].className = i + 1 === state.errorLine ? 'error' : i + 1 === state.currentLine ? 'current' : '';
  }
}

function placeMark(mark, line) {
  if (!line || line > state.lineCount) { mark.hidden = true; return; }
  const { lh, pad } = lineMetrics();
  mark.hidden = false;
  mark.style.top = `${pad + (line - 1) * lh - els.source.scrollTop}px`;
  mark.style.height = `${lh}px`;
}

function syncScroll() {
  const { scrollTop, scrollLeft } = els.source;
  els.highlight.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  els.gutter.style.transform = `translateY(${-scrollTop}px)`;
  placeMark(els.markCurrent, state.currentLine);
  placeMark(els.markError, state.errorLine);
}

function updateCursor() {
  const { value, selectionStart } = els.source;
  const before = value.slice(0, selectionStart);
  const line = before.split('\n').length;
  const col = selectionStart - before.lastIndexOf('\n');
  els.cursor.textContent = `Ln ${line}, Col ${col}`;
  if (line !== state.currentLine) {
    state.currentLine = line;
    updateGutter();
  }
  syncScroll();
}

function updateEditorDecorations() {
  updateHighlight();
  updateGutter();
  updateCursor();
}

function indentUnit() {
  return ' '.repeat(state.config?.editor.tab_size ?? 4);
}

function setDirty(dirty) {
  if (dirty === state.dirty) return;
  state.dirty = dirty;
  els.dirtyDot.hidden = !dirty;
  invoke('set_dirty', { dirty }).catch(() => {});
}

function onSourceChange() {
  updateEditorDecorations();
  setDirty(els.source.value !== state.savedCode);
  updateDiagramType();
  scheduleRender();
}

function setDocument(code, name) {
  els.source.value = code;
  state.savedCode = code;
  els.docName.textContent = name;
  els.docName.parentElement.title = name;
  state.dirty = true;          // force the update below
  setDirty(false);
  els.source.setSelectionRange(0, 0);
  els.source.scrollTop = 0;
  els.source.scrollLeft = 0;
  state.autoFit = true;
  state.errorLine = null;
  editor.reset();
  updateEditorDecorations();
  updateDiagramType();
  renderNow();
  els.source.focus();
}

/** First keyword of the diagram, skipping blank lines, comments and YAML front matter. */
function detectDiagram(code) {
  let frontMatter = false;
  let first = true;
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (frontMatter) {
      if (line === '---') frontMatter = false;
      continue;
    }
    if (first && line === '---') { frontMatter = true; first = false; continue; }
    if (!line || line.startsWith('%%')) continue;
    first = false;
    return line.split(/\s+/)[0];
  }
  return null;
}

function updateDiagramType(fallback) {
  const key = detectDiagram(els.source.value) ?? fallback;
  els.diagramType.textContent = key ? (DIAGRAM_NAMES[key] ?? key) : '';
  renderHelp();
}

// ---------------------------------------------------------------- preview

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(renderNow, state.config?.editor.render_delay_ms ?? 250);
}

function svgSize(svg) {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height };
  const box = svg.getBBox();
  return { w: box.width || 1, h: box.height || 1 };
}

function cleanupMermaidLeftovers(id) {
  for (const prefix of ['d', 'i', '']) document.getElementById(prefix + id)?.remove();
}

async function renderNow() {
  clearTimeout(state.renderTimer);
  if (!state.config) return;
  const code = els.source.value;
  const seq = ++state.renderSeq;

  if (!code.trim()) {
    els.stage.replaceChildren();
    els.empty.hidden = false;
    state.hasDiagram = false;
    state.valid = false;
    showError(null);
    setStatus('ok', 'Empty document');
    return;
  }

  const id = `lh-render-${seq}`;
  const kind = currentKind(code);
  try {
    prepareMermaid(kind);
    const { svg, diagramType } = await mermaid.render(id, code);
    if (seq !== state.renderSeq) return;
    els.stage.innerHTML = svg;
    const el = els.stage.querySelector('svg');
    window.LighthouseTheme.decorate(el, kind, code, state.config);
    el.style.removeProperty('max-width');
    state.size = svgSize(el);
    el.setAttribute('width', state.size.w);
    el.setAttribute('height', state.size.h);
    els.empty.hidden = true;
    els.stage.classList.remove('stale');
    state.hasDiagram = true;
    state.valid = true;
    showError(null);
    updateDiagramType(diagramType);
    if (state.autoFit) fitView(); else applyView();
    setStatus('ok', `${els.diagramType.textContent || 'Diagram'} rendered`);
  } catch (err) {
    cleanupMermaidLeftovers(id);
    if (seq !== state.renderSeq) return;
    state.valid = false;
    els.stage.classList.toggle('stale', state.hasDiagram);
    showError(err);
  }
}

function showError(err) {
  if (!err) {
    els.errorBanner.hidden = true;
    if (state.errorLine !== null) {
      state.errorLine = null;
      updateGutter();
      syncScroll();
    }
    return;
  }
  const message = errorMessage(err).trim();
  const fromHash = err?.hash?.loc?.first_line ?? err?.hash?.line;
  const fromText = /line (\d+)/i.exec(message);
  const line = fromText ? Number(fromText[1]) : Number.isInteger(fromHash) ? fromHash : null;
  state.errorLine = line && line <= state.lineCount ? line : null;
  updateGutter();
  syncScroll();
  els.errorText.textContent = message;
  els.errorBanner.hidden = false;
  // Jison errors start with "Parse error on line N:" and end with the useful part.
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean);
  const summary = lines.length > 1 && /^parse error on line/i.test(lines[0]) ? lines[lines.length - 1] : lines[0];
  setStatus('error', state.errorLine ? `Line ${state.errorLine}: ${summary}` : summary);
}

function applyView() {
  const { x, y, s } = state.view;
  els.stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  els.zoomReset.textContent = `${Math.round(s * 100)}%`;
  els.zoomFit.classList.toggle('active', state.autoFit);
}

function fitView() {
  state.autoFit = true;
  if (!state.hasDiagram) return applyView();
  const vw = els.viewport.clientWidth;
  const vh = els.viewport.clientHeight;
  const pad = Math.min(48, vw * 0.06, vh * 0.06);
  const { w, h } = state.size;
  const maxAuto = state.config?.preview.max_auto_zoom ?? 1.5;
  const s = Math.max(MIN_ZOOM, Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h, maxAuto));
  state.view = { s, x: (vw - w * s) / 2, y: (vh - h * s) / 2 };
  applyView();
}

function zoomAt(factor, cx, cy) {
  const { x, y, s } = state.view;
  const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s * factor));
  if (cx === undefined) {
    cx = els.viewport.clientWidth / 2;
    cy = els.viewport.clientHeight / 2;
  }
  state.view = { s: ns, x: cx - (cx - x) * (ns / s), y: cy - (cy - y) * (ns / s) };
  state.autoFit = false;
  applyView();
}

function actualSize() {
  const { w, h } = state.size;
  const vw = els.viewport.clientWidth;
  const vh = els.viewport.clientHeight;
  state.view = { s: 1, x: Math.max(16, (vw - w) / 2), y: Math.max(16, (vh - h) / 2) };
  state.autoFit = false;
  applyView();
}

function setupPreviewInteractions() {
  const vp = els.viewport;

  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
    if (e.shiftKey) {
      state.view.x -= (e.deltaY || e.deltaX) * unit;
      state.autoFit = false;
      applyView();
      return;
    }
    const factor = Math.exp(-e.deltaY * unit * 0.0016);
    zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  let drag = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
    vp.setPointerCapture(e.pointerId);
    vp.classList.add('panning');
  });
  vp.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    state.view.x = drag.vx + e.clientX - drag.x;
    state.view.y = drag.vy + e.clientY - drag.y;
    state.autoFit = false;
    applyView();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    vp.classList.remove('panning');
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('dblclick', fitView);

  $('zoom-in').addEventListener('click', () => zoomAt(1.25));
  $('zoom-out').addEventListener('click', () => zoomAt(0.8));
  $('zoom-reset').addEventListener('click', actualSize);
  $('zoom-fit').addEventListener('click', fitView);

  new ResizeObserver(() => { if (state.autoFit) fitView(); }).observe(vp);
}

// ------------------------------------------------------------------- help

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function setTab(tab) {
  state.tab = tab;
  const help = tab === 'help';
  els.previewPane.classList.toggle('show-help', help);
  els.tabPreview.classList.toggle('active', !help);
  els.tabHelp.classList.toggle('active', help);
  els.tabPreview.setAttribute('aria-selected', String(!help));
  els.tabHelp.setAttribute('aria-selected', String(help));
  if (help) renderHelp();
  else if (state.autoFit) fitView();
}

/** Small picture of an item type, drawn with its configured colors. */
function swatch(entry) {
  const { shape, fill, border, header } = entry;
  const f = escapeHtml(fill);
  const b = escapeHtml(border);
  const shapes = {
    item: `<rect x="2" y="3" width="30" height="16" rx="3" fill="${f}" stroke="${b}" stroke-width="1.6"/>`,
    box: `<rect x="2" y="3" width="30" height="16" rx="2" fill="${f}" stroke="${b}" stroke-width="1.6"/>`
      + `<rect x="2.8" y="3.8" width="28.4" height="5" fill="${escapeHtml(header ?? fill)}"/>`,
    ellipse: `<ellipse cx="17" cy="11" rx="15" ry="8" fill="${f}" stroke="${b}" stroke-width="1.6"/>`,
    diamond: `<path d="M17 2 L28 11 L17 20 L6 11 Z" fill="${f}" stroke="${b}" stroke-width="1.6"/>`,
    dot: `<circle cx="17" cy="11" r="6" fill="${f}"/>`,
    line: `<path d="M3 11 H27" stroke="${b}" stroke-width="2"/><path d="M25 7 L31 11 L25 15 Z" fill="${b}"/>`,
    actor: `<circle cx="17" cy="5.5" r="3.5" fill="${f}" stroke="${b}" stroke-width="1.5"/>`
      + `<path d="M17 9 V15 M12 11.5 H22 M17 15 L13 20 M17 15 L21 20" stroke="${b}" stroke-width="1.5" fill="none"/>`,
  };
  return `<svg class="swatch" viewBox="0 0 34 22" aria-hidden="true">${shapes[shape] ?? shapes.item}</svg>`;
}

function renderHelp() {
  if (!state.config || state.tab !== 'help') return;
  const kind = currentKind();
  if (state.helpKey === kind) return;
  state.helpKey = kind;

  const h = window.LighthouseHelp.content(kind);
  const hl = (code) => {
    if (!h.header) return window.LighthouseHighlight.render(code);
    return window.LighthouseHighlight.render(`${h.header}\n${code}`).split('\n').slice(1).join('\n');
  };
  const parts = [`<header class="help-head"><h2>${escapeHtml(h.title)}</h2><p>${h.intro}</p></header>`];

  const legend = window.LighthouseTheme.legend(kind, state.config);
  if (legend.length) {
    parts.push('<section><h3>Color code</h3><ul class="legend">'
      + legend.map((e) => `<li>${swatch(e)}<span>${escapeHtml(e.label)}</span></li>`).join('')
      + '</ul></section>');
  }

  h.sections.forEach((section, si) => {
    parts.push(`<section><h3>${escapeHtml(section.title)}</h3>`);
    section.items.forEach((item, ii) => {
      const insert = item.insert === false ? ''
        : `<button class="btn insert" data-snippet="${si}.${ii}" title="Insert below the current line">
             <svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Insert</button>`;
      parts.push(`<article class="help-item"><pre class="snippet"><code>${hl(item.code)}</code></pre>`
        + `<div class="help-row"><p>${item.text}</p>${insert}</div></article>`);
    });
    parts.push('</section>');
  });

  parts.push('<section><h3>Keyboard shortcuts</h3>');
  for (const [group, rows] of window.LighthouseHelp.shortcuts) {
    parts.push(`<h4>${escapeHtml(group)}</h4><table class="shortcuts">`
      + rows.map(([keys, what]) => `<tr><td>${keys.split(', ').map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(' ')}</td><td>${escapeHtml(what)}</td></tr>`).join('')
      + '</table>');
  }
  parts.push('</section>');

  els.help.innerHTML = parts.join('');
  els.help.scrollTop = 0;
  for (const button of els.help.querySelectorAll('[data-snippet]')) {
    const [si, ii] = button.dataset.snippet.split('.').map(Number);
    const code = h.sections[si].items[ii].code;
    button.addEventListener('click', () => {
      const line = editor.insertBlock(code);
      toast(`Inserted at line ${line}`);
    });
  }
}

function setupHelp() {
  els.tabPreview.addEventListener('click', () => setTab('preview'));
  els.tabHelp.addEventListener('click', () => setTab('help'));
}

// ----------------------------------------------------------------- export

async function rasterizePng() {
  const svg = els.stage.querySelector('svg');
  const { w, h } = state.size;
  const { png_scale, png_padding: pad, png_background } = state.config.export;

  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const W = w + 2 * pad;
    const H = h + 2 * pad;
    // Stay within the canvas limits of the web engine.
    const scale = Math.max(0.1, Math.min(png_scale, 16384 / W, 16384 / H, Math.sqrt(1.2e8 / (W * H))));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(W * scale);
    canvas.height = Math.ceil(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    if (png_background && png_background !== 'transparent') {
      ctx.fillStyle = png_background;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(img, pad, pad, w, h);

    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- actions

async function guarded(fn) {
  try {
    await fn();
  } catch (err) {
    toast(errorMessage(err), true, 6000);
  }
}

const actions = {
  async newDocument(template) {
    closeMenus();
    if (!(await invoke('confirm_discard'))) return;
    await invoke('new_document');
    setDocument(window.LighthouseTemplates[template] ?? window.LighthouseTemplates.class, 'Untitled');
  },

  async open() {
    closeMenus();
    if (!(await invoke('confirm_discard'))) return;
    const doc = await invoke('open_markdown');
    if (!doc) return;
    setDocument(doc.code, doc.name);
    if (doc.note) toast(doc.note, false, 6000);
  },

  async save(saveAs = false) {
    const code = els.source.value;
    const saved = await invoke('save_markdown', { code, saveAs });
    if (!saved) return;
    state.savedCode = code;
    els.docName.textContent = saved.name;
    els.docName.parentElement.title = saved.path;
    setDirty(els.source.value !== state.savedCode);
    toast(`Saved ${saved.name}`);
  },

  async copy(kind = 'code') {
    closeMenus();
    const code = els.source.value;
    const text = kind === 'markdown' ? await invoke('markdown_block', { code }) : code;
    await invoke('copy_text', { text });
    toast(kind === 'markdown' ? 'Markdown block copied' : 'Mermaid code copied');
  },

  async exportPng() {
    clearTimeout(state.renderTimer);
    await renderNow();
    if (!state.valid) {
      toast(state.hasDiagram || els.source.value.trim()
        ? 'Fix the errors in the diagram before exporting.'
        : 'Nothing to export yet.', true);
      return;
    }
    const data = await rasterizePng();
    const path = await invoke('export_png', { data });
    if (path) toast(`Exported ${path.split(/[\\/]/).pop()}`); // Windows paths use backslashes
  },
};

// ------------------------------------------------------------- UI wiring

function closeMenus() {
  els.menuNew.hidden = true;
  els.menuCopy.hidden = true;
}

function toggleMenu(menu) {
  const open = menu.hidden;
  closeMenus();
  menu.hidden = !open;
  if (open) menu.querySelector('button')?.focus();
}

function setupSplitter() {
  const KEY = 'lighthouse.split';
  const apply = (pct) => els.workspace.style.setProperty('--split', `${pct}%`);
  try {
    const saved = parseFloat(localStorage.getItem(KEY));
    if (saved >= 15 && saved <= 80) apply(saved);
  } catch { /* storage unavailable: keep the default */ }

  let dragging = false;
  els.splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    els.splitter.setPointerCapture(e.pointerId);
    els.splitter.classList.add('dragging');
  });
  els.splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = els.workspace.getBoundingClientRect();
    const pct = Math.min(80, Math.max(15, ((e.clientX - rect.left) / rect.width) * 100));
    apply(pct.toFixed(2));
  });
  els.splitter.addEventListener('pointerup', () => {
    dragging = false;
    els.splitter.classList.remove('dragging');
    try { localStorage.setItem(KEY, els.workspace.style.getPropertyValue('--split').replace('%', '')); } catch { /* ignore */ }
    syncScroll();
  });
  els.splitter.addEventListener('dblclick', () => {
    els.workspace.style.removeProperty('--split');
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  });
}

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return; // already handled by the editor
    if (e.key === 'Escape') { closeMenus(); return; }
    if (e.key === 'F1') { e.preventDefault(); setTab(state.tab === 'help' ? 'preview' : 'help'); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const run = (fn) => { e.preventDefault(); guarded(fn); };
    switch (key) {
      case 'z': return run(async () => (e.shiftKey ? editor.redo() : editor.undo()));
      case 'y': return run(async () => editor.redo());
      case 'n': return run(async () => toggleMenu(els.menuNew));
      case 'o': return run(actions.open);
      case 's': return run(() => actions.save(e.shiftKey));
      case 'e': return run(actions.exportPng);
      case 'r': return run(() => reloadConfig(true));
      case 'c': if (e.shiftKey) return run(() => actions.copy('code')); return undefined;
      case '0': return run(async () => fitView());
      case '1': return run(async () => actualSize());
      case '=': case '+': return run(async () => zoomAt(1.25));
      case '-': return run(async () => zoomAt(0.8));
      default: return undefined;
    }
  });
}

function setupToolbar() {
  $('btn-new').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(els.menuNew); });
  $('btn-copy-more').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(els.menuCopy); });
  $('btn-open').addEventListener('click', () => guarded(actions.open));
  $('btn-save').addEventListener('click', (e) => guarded(() => actions.save(e.shiftKey)));
  $('btn-copy').addEventListener('click', () => guarded(() => actions.copy('code')));
  $('btn-png').addEventListener('click', () => guarded(actions.exportPng));
  for (const b of els.menuNew.querySelectorAll('[data-template]')) {
    b.addEventListener('click', () => guarded(() => actions.newDocument(b.dataset.template)));
  }
  for (const b of els.menuCopy.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', () => guarded(() => actions.copy(b.dataset.copy)));
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) closeMenus();
  });
  // Native web context menu (Reload, Back...) makes no sense here, except in the editor.
  document.addEventListener('contextmenu', (e) => {
    if (e.target !== els.source) e.preventDefault();
  });
}

function setupEditor() {
  const ta = els.source;
  ta.addEventListener('scroll', syncScroll);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === ta) updateCursor();
  });
  new ResizeObserver(syncScroll).observe(els.codeArea);
}

const editor = window.LighthouseEditor.create(els.source, {
  onChange: onSourceChange,
  indentUnit,
  lineHeight: () => lineMetrics().lh,
});

async function init() {
  setupToolbar();
  setupEditor();
  setupPreviewInteractions();
  setupSplitter();
  setupShortcuts();
  setupHelp();
  await guarded(() => reloadConfig(false));
  if (!state.config) return;
  let doc = null;
  try {
    doc = await invoke('initial_document');
  } catch (err) {
    toast(errorMessage(err), true, 6000);
  }
  if (doc) {
    setDocument(doc.code, doc.name);
    if (doc.note) toast(doc.note, false, 6000);
  } else {
    setDocument(window.LighthouseTemplates.class, 'Untitled');
  }
}

init();
