// Frontend checks run in CI (`npm run check`): every New-menu template and
// every help snippet must render with Mermaid and the default theme.
//
// Needs Chromium for Playwright: `npx playwright install chromium`.
// LIGHTHOUSE_CHROMIUM=/path/to/chrome overrides the browser executable.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parse } from 'smol-toml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

const config = parse(read('src-tauri', 'default-config.toml'));
config.diagram.overrides ??= {};
const scripts = ['src/vendor/mermaid.min.js', 'src/highlight.js', 'src/theme.js', 'src/templates.js', 'src/help.js'];

const browser = await chromium.launch({ executablePath: process.env.LIGHTHOUSE_CHROMIUM || undefined });
try {
  const page = await browser.newPage();
  await page.setContent('<div id="out"></div>');
  for (const script of scripts) await page.addScriptTag({ content: read(script) });

  const results = await page.evaluate(async (cfg) => {
    const { LighthouseTheme: theme, LighthouseTemplates: templates, LighthouseHelp: help } = window;
    const out = [];
    let n = 0;
    const render = async (label, code) => {
      const first = code.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) ?? '';
      const kind = theme.kindOf(first.trim().split(/\s+/)[0]);
      mermaid.initialize(theme.mermaidConfig(cfg, kind));
      try {
        const { svg } = await mermaid.render(`check${n++}`, code);
        const host = document.getElementById('out');
        host.innerHTML = svg;
        theme.decorate(host.querySelector('svg'), kind, code, cfg);
        out.push({ label, ok: true });
      } catch (err) {
        out.push({ label, ok: false, error: String(err?.message ?? err).split('\n')[0] });
      }
    };

    for (const [name, code] of Object.entries(templates)) await render(`template ${name}`, code);

    const samples = { classDiagram: 'class A', sequenceDiagram: 'A->>B: x', 'usecase-beta': 'actor A', 'stateDiagram-v2': '[*] --> A', 'flowchart TD': 'A --> B' };
    for (const [kind, page] of Object.entries(help.all)) {
      for (const section of page.sections) {
        for (const item of section.items) {
          const code = page.header
            ? `${page.header}\n${item.code.split('\n').map((l) => `    ${l}`).join('\n')}`
            : `${item.code}\n    ${samples[item.code] ?? ''}`;
          await render(`help ${kind}: ${item.code.split('\n')[0]}`, code);
        }
      }
    }
    return out;
  }, config);

  const failures = results.filter((r) => !r.ok);
  for (const f of failures) console.error(`FAIL ${f.label}\n     ${f.error}`);
  console.log(`${results.length - failures.length}/${results.length} diagrams rendered`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await browser.close();
}
