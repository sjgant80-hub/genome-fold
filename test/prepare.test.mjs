// The Consumer Rights Act converter: legislation.gov.uk's XML (CLML) to the markdown corpus the demo cell is folded from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { decode, parseXml, flat, sectionParagraphs, chapterMarkdown, toCorpus } from '../examples/consumer-rights-act/prepare.mjs';

const DIR = new URL('../examples/consumer-rights-act/', import.meta.url);

test('decode: named, decimal and hex entities; unknown or out-of-range ones kept as they are', () => {
  assert.equal(decode('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#8212; &#x2014; &#X41; &nbsp; &#x110000;'), 'a & b <c> "d" \'e\' — — A &nbsp; &#x110000;');
  assert.equal(decode('&#1114111;').codePointAt(0), 0x10ffff);
  assert.equal(decode(5), '5');
});

test('parseXml: elements and text, comments and declarations dropped, CDATA kept, stray closers ignored, unclosed closed', () => {
  const t = parseXml('<?xml version="1.0"?><!-- c --><A x="1"><B>hi &amp; bye</B><C/><![CDATA[<raw>]]></Z></A><D><E>open');
  assert.deepEqual(t, { name: '#root', kids: [
    { name: 'A', kids: [{ name: 'B', kids: ['hi & bye'] }, { name: 'C', kids: [] }, '<raw>'] },
    { name: 'D', kids: [{ name: 'E', kids: ['open'] }] }] });
  assert.deepEqual(parseXml('</A>x'), { name: '#root', kids: ['x'] });
  assert.deepEqual(parseXml('<A></#root>x</A>'), { name: '#root', kids: [{ name: 'A', kids: ['x'] }] });
  assert.deepEqual(parseXml('<A><B></A>after'), { name: '#root', kids: [{ name: 'A', kids: [{ name: 'B', kids: [] }] }, 'after'] });
});

test('flat: inline text runs together, blocks are spaced, paragraph numbers in brackets, tables joined, notes left out', () => {
  const x = parseXml('<P2para><Text>The <Term>trader</Term>\'s goods<CommentaryRef Ref="k"/>—</Text><P3><Pnumber>a</Pnumber><P3para><Text>one,</Text></P3para></P3>' +
    '<P3><Pnumber> b </Pnumber><P3para><Text>two.</Text></P3para></P3></P2para>').kids[0];
  assert.equal(flat(x).replace(/\s+/g, ' ').trim(), 'The trader\'s goods— (a) one, (b) two.');
  const tb = parseXml('<tbody><tr><td>s 16:</td><td>goods</td></tr><tr><td> </td><td>x</td></tr></tbody>').kids[0];
  assert.equal(flat(tb), 's 16: | goods; x');
  assert.equal(flat(parseXml('<Commentaries><Text>note</Text></Commentaries>').kids[0]), '');
  assert.equal(flat(parseXml('<colgroup><col/></colgroup>').kids[0]), '');
});

test('sectionParagraphs: one per subsection; the whole section when it has none; nothing when it has no body', () => {
  const p1 = parseXml('<P1><Pnumber>9</Pnumber><P1para><P2><Pnumber>1</Pnumber><P2para><Text>First.</Text></P2para></P2>' +
    '<P2><Pnumber>2</Pnumber><P2para><Text> </Text></P2para></P2><P2><Pnumber>3</Pnumber><P2para><Text>Third.</Text></P2para></P2></P1para></P1>').kids[0];
  assert.deepEqual(sectionParagraphs(p1), ['(1) First.', '(2)', '(3) Third.']);
  const one = parseXml('<P1><P1para><Text>Only  text.</Text></P1para></P1>').kids[0];
  assert.deepEqual(sectionParagraphs(one), ['Only text.']);
  assert.deepEqual(sectionParagraphs(parseXml('<P1><Pnumber>1</Pnumber></P1>').kids[0]), []);
  assert.deepEqual(sectionParagraphs(parseXml('<P1><P1para><Text> </Text></P1para></P1>').kids[0]), []);
});

test('chapterMarkdown: the chapter heading, cross-headings and sections in order', () => {
  const ch = parseXml('<Chapter><Number>CHAPTER 2</Number><Title>Goods</Title>' +
    '<Pblock><Title><Emphasis>What is covered?</Emphasis></Title><P1group><Title>Scope</Title><P1><Pnumber><CommentaryRef Ref="x"/>3</Pnumber>' +
    '<P1para><P2><Pnumber>1</Pnumber><P2para><Text>It applies.</Text></P2para></P2></P1para></P1></P1group></Pblock>' +
    'stray text<P1group><Title> Ownership </Title><P1><Pnumber>4</Pnumber><P1para><Text>Means property.</Text></P1para></P1>' +
    '<P1><Pnumber>4A</Pnumber><P1para><Text>Added.</Text></P1para></P1></P1group></Chapter>').kids[0];
  assert.equal(chapterMarkdown(ch), '# CHAPTER 2: Goods\n\n## What is covered?\n\n### Section 3: Scope\n\n(1) It applies.\n\n### Section 4: Ownership\n\nMeans property.\n\n' +
    '### Section 4A: Ownership\n\nAdded.\n');
  assert.equal(chapterMarkdown(parseXml('<Chapter></Chapter>').kids[0]), '# : \n');
});

test('toCorpus: one file per chapter, numbered in order; and the committed corpus is exactly what the committed XML gives', () => {
  const two = toCorpus('<Body><Part><Chapter><Number>C1</Number><Title>A</Title></Chapter><Chapter><Number>C2</Number><Title>B</Title></Chapter></Part></Body>');
  assert.deepEqual(Object.keys(two), ['01-chapter-1.md', '02-chapter-2.md']);
  assert.equal(two['02-chapter-2.md'], '# C2: B\n');
  const xml = gunzipSync(readFileSync(new URL('sources/part-1.xml.gz', DIR)));
  assert.equal(createHash('sha256').update(xml).digest('hex'), 'd43c398aa31fa46f41227af419dbe3351482eaeb477939daa56ffd751d242b76', 'the source is the file as retrieved');
  const files = toCorpus(xml.toString('utf8'));
  const names = readdirSync(new URL('corpus/', DIR)).sort();
  assert.deepEqual(Object.keys(files).sort(), names);
  for (const n of names) assert.equal(files[n], readFileSync(new URL('corpus/' + n, DIR), 'utf8'), n);
  const all = Object.values(files).join('');
  assert.equal((all.match(/^### Section /gm) || []).length, 60);
  assert.ok(files['02-chapter-2.md'].includes('### Section 9: Goods to be of satisfactory quality\n\n(1) Every contract to supply goods is to be treated as including a term that the quality of the goods is satisfactory.\n'));
  assert.ok(!/key-[0-9a-f]{8}|CommentaryRef|<\w/.test(all));
});
