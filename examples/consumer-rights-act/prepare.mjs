// prepare.mjs — turn legislation.gov.uk's XML (CLML) for an Act's Part into a markdown corpus the fold engine reads:
// one file per chapter, a heading per chapter, cross-heading and section, and one paragraph per subsection (its lettered
// paragraphs kept inline, in order). Editorial notes (the commentaries and their reference marks) and the metadata are
// left out; amended words are kept as the law now reads, without the amendment brackets. Pure and total.
//   node examples/consumer-rights-act/prepare.mjs <part.xml or part.xml.gz> <corpus-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const SKIP = new Set(['ukm:Metadata', 'Commentaries', 'CommentaryRef', 'colgroup']);
const BLOCK = new Set(['P2', 'P2para', 'P3', 'P3para', 'P4', 'P4para', 'P5', 'P5para', 'Text', 'Para', 'ListItem', 'UnorderedList',
  'OrderedList', 'Tabular', 'table', 'tbody', 'tr', 'td', 'th']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)[^>]*?(\/?)>|([^<]+)/g;

// decode(s) → the text with XML entities replaced (an unknown entity is kept as it is)
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

// parseXml(src) → { name:'#root', kids:[...] }: elements as { name, kids }, text as strings; an unclosed element is
// closed at the end, a stray closing tag is ignored
export function parseXml(src) {
  const root = { name: '#root', kids: [] }, stack = [root];
  for (const m of String(src).matchAll(TOKEN)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push(m[1]);
    else if (m[2] !== undefined) { const i = stack.map((n) => n.name).lastIndexOf(m[2]); if (i > 0) stack.length = i; }
    else if (m[3] !== undefined) { const el = { name: m[3], kids: [] }; top.kids.push(el); if (m[4] === '') stack.push(el); }
    else if (m[5] !== undefined) top.kids.push(decode(m[5]));
  }
  return root;
}

const kids = (n, name) => n.kids.filter((k) => typeof k !== 'string' && k.name === name);
const space = (s) => s.replace(/\s+/g, ' ').trim();

// flat(node) → the node's text as one line: block elements are separated by a space, a paragraph number is shown as
// "(a)", table cells are joined by " | " and rows by "; "
export function flat(n) {
  if (typeof n === 'string') return n;
  if (SKIP.has(n.name)) return '';
  if (n.name === 'Pnumber') return '(' + space(n.kids.map(flat).join('')) + ')';
  const sep = n.name === 'tr' ? ' | ' : (n.name === 'tbody' ? '; ' : '');
  const parts = n.kids.map((k) => (typeof k !== 'string' && BLOCK.has(k.name) ? ' ' + flat(k) + ' ' : flat(k)));
  return sep ? parts.map(space).filter((p) => p !== '').join(sep) : parts.join('');
}

// sectionParagraphs(p1) → one paragraph per subsection of a section, or the whole section when it has none
export function sectionParagraphs(p1) {
  const para = kids(p1, 'P1para')[0];
  if (!para) return [];
  const subs = kids(para, 'P2');
  return (subs.length > 0 ? subs.map(flat) : [flat(para)]).map(space).filter((t) => t !== '');
}

// chapterMarkdown(ch) → the chapter as markdown: its heading, then each cross-heading and section in order
export function chapterMarkdown(ch) {
  const head = (n) => space(flat(kids(n, 'Title')[0] || { name: 'x', kids: [] }));
  const out = [`# ${space(flat(kids(ch, 'Number')[0] || { name: 'x', kids: [] }))}: ${head(ch)}`];
  const walk = (n) => {
    for (const k of n.kids) {
      if (typeof k === 'string') continue;
      if (k.name === 'Pblock') { out.push(`## ${head(k)}`); walk(k); }
      else if (k.name === 'P1group') {
        for (const p1 of kids(k, 'P1')) {
          out.push(`### Section ${space(flat(kids(p1, 'Pnumber')[0] || { name: 'x', kids: [] })).replace(/[()]/g, '')}: ${head(k)}`);
          out.push(...sectionParagraphs(p1));
        }
      }
    }
  };
  walk(ch);
  return out.join('\n\n') + '\n';
}

// toCorpus(xml) → { '<NN>-chapter-<n>.md': markdown } for every chapter of the document's body
export function toCorpus(xml) {
  const files = {};
  const find = (n, name) => (typeof n === 'string' ? [] : [...(n.name === name ? [n] : []), ...n.kids.flatMap((k) => find(k, name))]);
  find(parseXml(xml), 'Chapter').forEach((ch, i) => { files[`${String(i + 1).padStart(2, '0')}-chapter-${i + 1}.md`] = chapterMarkdown(ch); });
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [src, dir] = process.argv.slice(2);
  const raw = readFileSync(src);
  const files = toCorpus((src.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  mkdirSync(dir, { recursive: true });
  for (const [name, md] of Object.entries(files)) writeFileSync(join(dir, name), md);
  console.log(`${Object.keys(files).length} chapter file(s) written to ${dir}`);
}
