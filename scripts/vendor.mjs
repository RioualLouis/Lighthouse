// Copies Mermaid from node_modules into src/vendor (works on Linux and Windows).
// Run automatically by `npm run dev` / `npm run build` through tauri.conf.json.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mermaid = join(root, 'node_modules', 'mermaid');
const vendor = join(root, 'src', 'vendor');

mkdirSync(vendor, { recursive: true });
copyFileSync(join(mermaid, 'dist', 'mermaid.min.js'), join(vendor, 'mermaid.min.js'));
copyFileSync(join(mermaid, 'LICENSE'), join(vendor, 'mermaid.LICENSE'));
console.log('Mermaid copied to src/vendor');
