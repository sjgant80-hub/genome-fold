// linkModules(mods, toUrl) — the page carries each module as the exact bytes of its file (a <script type="text/plain"
// data-module="<path>">), so the logic that runs here is the logic the mutation gate proved. This links them: every
// relative import is pointed at the linked copy of the module it names, and toUrl turns a source into an importable URL
// (a Blob URL in the browser; a data: URL in the page test). Returns link(path) → the URL to import.
function linkModules(mods, toUrl) {
  const urls = {};
  const resolve = (from, spec) => {
    const parts = from.split('/').slice(0, -1);
    for (const s of spec.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); }
    return parts.join('/');
  };
  const link = (path) => {
    if (urls[path]) return urls[path];
    if (!Object.hasOwn(mods, path)) throw new Error('this page does not carry the module ' + path);
    const src = mods[path].replace(/(\bfrom\s*)(['"])(\.\.?\/[^'"]+)\2/g, (m, a, q, spec) => a + q + link(resolve(path, spec)) + q);
    urls[path] = toUrl(src);
    return urls[path];
  };
  return link;
}
