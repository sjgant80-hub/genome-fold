// node scripts/make-page.mjs — build index.html, the engine's page, from page/engine.html, the modules it carries,
// data/measure.json, data/demo.json and data/gates.json. CI checks the result is a fixpoint: building again changes nothing.
import { writeFileSync, readFileSync } from 'node:fs';
import { enginePage } from '../src/build-page.mjs';

const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const html = enginePage(read('data/measure.json'), read('data/demo.json'), read('data/gates.json'));
writeFileSync(new URL('../index.html', import.meta.url), html);
console.log(`index.html: ${html.length} characters`);
