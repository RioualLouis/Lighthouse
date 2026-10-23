// Editing behaviour of the Mermaid textarea: undo/redo history and line
// commands. The history is managed here rather than by the web engine so
// that every change, typed or made by a command, can be undone consistently.
'use strict';

(function () {
  const MERGE_DELAY_MS = 1000; // consecutive typing within this delay is one undo step
  const HISTORY_LIMIT = 1000;

  function inputGroup(inputType) {
    if (inputType === 'insertText' || inputType === 'insertCompositionText') return 'insert';
    if (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') return 'delete';
    return null; // paste, cut, drop, line break...: always a step of its own
  }

  /**
   * @param {HTMLTextAreaElement} ta
   * @param {{ onChange: () => void, indentUnit: () => string, lineHeight: () => number }} opts
   */
  function create(ta, opts) {
    let stack = [];
    let index = -1;
    let lastGroup = null;
    let lastTime = 0;

    const snapshot = () => ({ value: ta.value, start: ta.selectionStart, end: ta.selectionEnd });

    function reset() {
      stack = [snapshot()];
      index = 0;
      lastGroup = null;
    }

    function record(group) {
      const now = Date.now();
      const snap = snapshot();
      if (stack[index]?.value === snap.value) {
        stack[index] = snap;
        return;
      }
      stack.length = index + 1; // a new change drops the redo branch
      const caretMoved = group === 'insert' && Math.abs(stack[index].end - snap.start) > 1;
      if (group && group === lastGroup && now - lastTime < MERGE_DELAY_MS && index > 0 && !caretMoved) {
        stack[index] = snap;
      } else {
        stack.push(snap);
        index += 1;
        if (stack.length > HISTORY_LIMIT) {
          stack.shift();
          index -= 1;
        }
      }
      lastGroup = group;
      lastTime = now;
    }

    function revealCaret() {
      const lh = opts.lineHeight();
      const line = ta.value.slice(0, ta.selectionEnd).split('\n').length;
      const top = (line - 1) * lh;
      if (top < ta.scrollTop) ta.scrollTop = top;
      else if (top + 2 * lh > ta.scrollTop + ta.clientHeight) ta.scrollTop = top + 2 * lh - ta.clientHeight;
    }

    /** Shows `target`, with the caret at the end of the region that differs from the current text. */
    function restore(target) {
      const cur = ta.value;
      const next = target.value;
      let prefix = 0;
      while (prefix < cur.length && prefix < next.length && cur[prefix] === next[prefix]) prefix++;
      let suffix = 0;
      while (suffix < cur.length - prefix && suffix < next.length - prefix
        && cur[cur.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
      ta.value = next;
      const caret = next.length - suffix;
      ta.setSelectionRange(caret, caret);
      lastGroup = null;
      revealCaret();
      opts.onChange();
    }

    function undo() {
      if (index <= 0) return false;
      index -= 1;
      restore(stack[index]);
      return true;
    }

    function redo() {
      if (index >= stack.length - 1) return false;
      index += 1;
      restore(stack[index]);
      return true;
    }

    /** Replaces [start, end) with `text` as one undoable step. */
    function replace(start, end, text, selStart = start + text.length, selEnd = selStart) {
      ta.focus();
      ta.setRangeText(text, start, end);
      ta.setSelectionRange(selStart, selEnd);
      record(null);
      lastGroup = null;
      revealCaret();
      opts.onChange();
    }

    /** Range of the full lines touched by the selection: [start, end) without the final newline. */
    function selectedLines() {
      const { value, selectionStart: s, selectionEnd: e } = ta;
      const start = value.lastIndexOf('\n', s - 1) + 1;
      let end = e > s && value[e - 1] === '\n' ? e - 1 : e;
      const nl = value.indexOf('\n', end);
      end = nl === -1 ? value.length : nl;
      return { start, end, text: value.slice(start, end) };
    }

    // ------------------------------------------------------------ commands

    function indent(outdent) {
      const unit = opts.indentUnit();
      const { selectionStart: s, selectionEnd: e, value } = ta;
      if (!outdent && !value.slice(s, e).includes('\n')) {
        replace(s, e, unit);
        return;
      }
      const { start, end, text } = selectedLines();
      const changed = text.split('\n').map((l) => {
        if (!outdent) return l.length ? unit + l : l;
        const n = l.match(/^ */)[0].length;
        return l.slice(Math.min(n, unit.length));
      }).join('\n');
      replace(start, end, changed, start, start + changed.length);
    }

    function newline() {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const current = value.slice(lineStart, s);
      let pad = current.match(/^[ \t]*/)[0];
      if (/\{\s*$/.test(current)) pad += opts.indentUnit();
      replace(s, e, '\n' + pad);
    }

    function duplicateLines() {
      const { start, end, text } = selectedLines();
      const { selectionStart: s, selectionEnd: e } = ta;
      const offset = text.length + 1;
      replace(end, end, '\n' + text, s + offset, e + offset);
    }

    function deleteLines() {
      const { start, end } = selectedLines();
      const value = ta.value;
      const from = end < value.length ? start : Math.max(0, start - 1);
      const to = end < value.length ? end + 1 : end;
      replace(from, to, '', from, from);
    }

    function moveLines(direction) {
      const { start, end, text } = selectedLines();
      const value = ta.value;
      const { selectionStart: s, selectionEnd: e } = ta;
      if (direction < 0) {
        if (start === 0) return;
        const prevStart = value.lastIndexOf('\n', start - 2) + 1;
        const prev = value.slice(prevStart, start - 1);
        const shift = prev.length + 1;
        replace(prevStart, end, `${text}\n${prev}`, s - shift, e - shift);
      } else {
        if (end >= value.length) return;
        const nextEnd = value.indexOf('\n', end + 1) === -1 ? value.length : value.indexOf('\n', end + 1);
        const next = value.slice(end + 1, nextEnd);
        const shift = next.length + 1;
        replace(start, nextEnd, `${next}\n${text}`, s + shift, e + shift);
      }
    }

    function toggleComment() {
      const { start, end, text } = selectedLines();
      const lines = text.split('\n');
      const filled = lines.filter((l) => l.trim());
      const commented = filled.length > 0 && filled.every((l) => /^\s*%%/.test(l));
      const changed = lines.map((l) => {
        if (!l.trim()) return l;
        if (commented) return l.replace(/^(\s*)%% ?/, '$1');
        const pad = l.match(/^\s*/)[0];
        return `${pad}%% ${l.slice(pad.length)}`;
      }).join('\n');
      replace(start, end, changed, start, start + changed.length);
    }

    /**
     * Inserts a multi-line snippet on new lines below the caret line (or on the
     * caret line when it is blank), indented like the surrounding code.
     * Returns the line number of the first inserted line.
     */
    function insertBlock(snippet) {
      const value = ta.value;
      const lineOf = (pos) => value.slice(0, pos).split('\n').length;
      const { start, end, text } = selectedLines();
      const blank = !text.trim();
      // Indentation reference: the caret line, or the closest non-blank line above it.
      let ref = text;
      let refStart = start;
      if (blank) {
        const before = value.slice(0, start).replace(/\s+$/, '');
        refStart = before.lastIndexOf('\n') + 1;
        ref = before.slice(refStart);
      }
      let pad = ref.match(/^[ \t]*/)[0];
      const isHeader = ref.trim() && !value.slice(0, refStart).trim();
      if (isHeader || /\{\s*$/.test(ref)) pad += opts.indentUnit();
      const body = snippet.split('\n').map((l) => (l ? pad + l : l)).join('\n');
      if (blank) {
        replace(start, end, body);
        return lineOf(start);
      }
      replace(end, end, '\n' + body);
      return lineOf(end) + 1;
    }

    function handleKey(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const run = (fn) => { e.preventDefault(); fn(); };

      if (ctrl && !e.altKey) {
        if (key === 'z') return run(() => (e.shiftKey ? redo() : undo()));
        if (key === 'y' && !e.shiftKey) return run(redo);
        if (key === 'd' && !e.shiftKey) return run(duplicateLines);
        if (key === 'k' && e.shiftKey) return run(deleteLines);
        if (key === '/' || e.code === 'NumpadDivide') return run(toggleComment);
        return undefined;
      }
      if (e.altKey && !ctrl && (key === 'ArrowUp' || key === 'ArrowDown')) {
        return run(() => moveLines(key === 'ArrowUp' ? -1 : 1));
      }
      if (key === 'Tab' && !ctrl && !e.altKey) return run(() => indent(e.shiftKey));
      if (key === 'Enter' && !ctrl && !e.altKey && !e.isComposing) return run(newline);
      return undefined;
    }

    ta.addEventListener('keydown', handleKey);
    ta.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
      if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
    });
    ta.addEventListener('input', (e) => {
      record(inputGroup(e.inputType));
      opts.onChange();
    });

    return { reset, undo, redo, replace, insertBlock, revealCaret };
  }

  window.LighthouseEditor = { create };
})();
