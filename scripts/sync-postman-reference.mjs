import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parse, parseFragment } from '../notion/node_modules/parse5/dist/index.js';
const config = JSON.parse(await readFile(new URL('./postman-reference.json', import.meta.url), 'utf8'));
const reference = new URL('../api/reference.html', import.meta.url);
const escape = (s) => s.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const placeholder = (key) => 'YOUR_' + slug(key).replaceAll('-', '_').toUpperCase();
const version = /^\/public\/[\d.]+(?=\/)/;
const variable = /(?:%7B%7B|\{\{)([\w-]+)(?:%7D%7D|\}\})|(?<=\/)(?::|%3A)([\w-]+)/gi;
const routeKey = (verb, path) => verb + ' ' + path.replace(variable, (_, braces, colon) => ':' + (braces ?? colon));
const quote = (value) => '"' + value.replace(/["\\$\x60]/g, '\\$&') + '"';
const examplePath = (path) => path.replace(variable, (_, braces, colon) => placeholder(braces ?? colon));
const decode = (path) => { try { return decodeURIComponent(path); } catch { return path; } };
const active = (params = []) => params.filter(({ disabled, key }) => !disabled && key);
const keys = (params) => active(params).map(({ key }) => key);
const warn = (message) => console.warn('::warning::' + message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
const text = (node) => node?.nodeName === '#text' ? node.value : (node?.childNodes ?? []).map(text).join('');
const description = (value) => {
  const content = (typeof value === 'string' ? value : value?.content ?? '').trim();
  return /^<(?:p|div|ul|ol|pre|h[1-6])\b/i.test(content) ? text(parseFragment(content)).replace(/\s+/g, ' ').trim() : content;
};
const example = (value, key = 'body') => {
  if (Array.isArray(value)) return value.slice(0, 1).map((item) => example(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, example(item, name)]));
  return typeof value === 'string' ? placeholder(key) : { number: 0, boolean: false }[typeof value] ?? null;
};
function collect(items, routes = new Map(), folder) {
  for (const item of items) {
    if (Array.isArray(item.item)) { collect(item.item, routes, folder ?? item.name); continue; }
    const { method, url, body, description: prose } = item.request ?? {};
    const verb = method?.toUpperCase();
    if (!/^[A-Z]+$/.test(verb ?? '') || !url || typeof item.name !== 'string') throw new Error('Invalid Postman request');
    const address = URL.parse(typeof url === 'string' ? url : url.raw ??
      (url.protocol + '://' + url.host?.join('.') + (url.port ? ':' + url.port : '') + '/' + (url.path?.join('/') ?? '')));
    if (address?.protocol !== 'https:') { warn('Skipping non-HTTPS Postman request ' + item.name); continue; }
    const path = address.pathname, route = routeKey(verb, path);
    if (routes.has(route)) continue;
    const query = url.query ? keys(url.query) : [...address.searchParams.keys()];
    const mode = body?.mode, form = ['formdata', 'urlencoded'].includes(mode) ? active(body[mode]) : [];
    let json;
    if (mode === 'raw') try { json = example(JSON.parse(body.raw)); } catch { /* Use the generic raw body placeholder. */ }
    const pathKeys = [...path.matchAll(variable)].map(([, braces, colon]) => braces ?? colon);
    const jsonKeys = json && !Array.isArray(json) && typeof json === 'object' ? Object.keys(json) : [];
    const params = new Set([...query, ...form.map(({ key }) => key), ...pathKeys, ...keys(url.variable), ...jsonKeys]);
    const group = config.groups[verb + ' ' + folder] ?? config.groups[folder];
    routes.set(route, { verb, address, path, group, title: item.name, prose: description(prose), params, query, mode, form, json });
  }
  return routes;
}
function render(id, { verb, address, path, title, prose, query, mode, form, json }) {
  const search = new URLSearchParams(query.map((key) => [key, placeholder(key)])).toString();
  const curl = ['curl -X ' + verb, quote(address.origin + examplePath(path) + (search ? '?' + search : '')), '-H "X-A5-APIKEY: $ALIVE5_KEY"'];
  for (const { key, type } of form) {
    const file = mode === 'formdata' && type === 'file', value = placeholder(key);
    const flag = mode === 'urlencoded' ? '--data-urlencode' : file ? '--form' : '--form-string';
    curl.push(flag + ' ' + quote(key + '=' + (file ? '@' + value + '_FILE' : value)));
  }
  if (mode === 'raw') curl.push(json === undefined ? '--data-raw "YOUR_REQUEST_BODY"' : "--json '" + JSON.stringify(json).replaceAll("'", "'\\''") + "'");
  if (mode === 'file') curl.push('--data-binary "@YOUR_REQUEST_FILE"');
  const label = escape(verb + ' ' + title);
  return `<div class="endpoint reference-entry" id="${id}" data-postman>
          <div class="reference-description">
            <h3><span class="method m-${verb.toLowerCase()}">${verb}</span>${escape(title)}</h3>
            <p class="path">${escape(decode(path.replace(version, '')))}</p>
${prose ? '            <p>' + escape(prose) + '</p>\n' : ''}          </div>
          <div aria-label="Examples for ${label}" class="reference-examples" role="group">
            <figure class="reference-code">
              <figcaption><span>Request</span><span>curl</span><button class="copy" type="button">Copy</button></figcaption>
              <pre aria-label="curl request for ${label}" tabindex="0"><code>${escape(curl.join(' \\\n  '))}</code></pre>
            </figure>
          </div>
        </div>`;
}
const attr = (node, name) => node.attrs?.find((attribute) => attribute.name === name)?.value;
const has = (node, name) => attr(node, 'class')?.split(/\s+/).includes(name);
const walk = function* (node) { yield node; for (const child of node.childNodes ?? []) yield* walk(child); };
const location = (node) => node.sourceCodeLocation;
const generatedKey = (verb, path, label) => JSON.stringify([path, routeKey(verb, label.trim())]);
function sync(html, routes) {
  const nodes = [...walk(parse(html, { sourceCodeLocationInfo: true }))].filter(location);
  const entries = nodes.filter((node) => has(node, 'endpoint') && has(node, 'reference-entry'));
  const generated = new Set(entries.filter((node) => attr(node, 'data-postman') !== undefined));
  const anchors = new Set([...generated].map((node) => attr(node, 'id')).filter(Boolean));
  const ids = new Set(nodes.map((node) => attr(node, 'id')));
  const toc = new Map(nodes.filter((node) => has(node, 'reference-toc-section')).map((node) => [attr(node, 'href').slice(1), node.parentNode]));
  const sections = nodes.filter((node) => node.tagName === 'h2' && toc.has(attr(node, 'id')));
  if (!sections.length) throw new Error('Missing reference sections');
  const edits = [], curated = new Set(), previous = new Map();
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const lineStart = (offset) => html.lastIndexOf('\n', offset - 1) + 1;
  const atLineStart = (offset) => !html.slice(lineStart(offset), offset).trim();
  const insert = (offset, block, indent) => edits.push(atLineStart(offset)
    ? [lineStart(offset), lineStart(offset), ' '.repeat(indent) + block.replaceAll('\n', newline) + newline] : [offset, offset, block]);
  for (const node of [...generated, ...nodes.filter((node) => has(node, 'reference-toc-endpoint') && anchors.has(attr(node, 'href')?.slice(1)))]) {
    const { startOffset, endOffset } = location(node);
    const tail = atLineStart(startOffset) && /^[ \t]*\r?\n/.exec(html.slice(endOffset));
    edits.push(tail ? [lineStart(startOffset), endOffset + tail[0].length, ''] : [startOffset, endOffset, '']);
  }
  let drift = 0;
  for (const entry of entries) {
    const children = [...walk(entry)], id = attr(entry, 'id'), content = text(entry);
    const verb = text(children.find((node) => has(node, 'method'))).trim();
    const path = text(children.find((node) => has(node, 'path'))).trim();
    const curl = text(children.find((node) => node.tagName === 'code' && text(node).trimStart().startsWith('curl')));
    if (generated.has(entry)) {
      if (id) previous.set(generatedKey(verb, curl.match(/"https:\/\/[^/"?]+(\/[^"?]*)/)?.[1], path), id);
      continue;
    }
    const prefix = curl.match(/https:\/\/[^/\s"']+(\/public\/[\d.]+)\//)?.[1] ?? '';
    const route = routeKey(verb, version.test(path) ? path : prefix + path);
    curated.add(route);
    const missing = [...routes.get(route)?.params ?? []].filter((key) =>
      !new RegExp('(?<![\\w-])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(content));
    if (routes.has(route) && !missing.length) continue;
    drift++;
    warn('#' + id + ' ' + route + (routes.has(route) ? ' is missing Postman parameters ' + missing.join(', ') : ' is missing from Postman'));
  }
  for (const [route, item] of routes) {
    if (curated.has(route)) continue;
    const { verb, path } = item, prior = previous.get(generatedKey(verb, quote(examplePath(path)).slice(1, -1), decode(path.replace(version, ''))));
    const name = slug(item.title), base = verb.toLowerCase() + (name ? '-' + name : '');
    let id = prior ?? (name && !ids.has(name) ? name : base);
    for (let n = 2; !prior && ids.has(id); n++) id = base + '-' + n;
    ids.add(id);
    const section = sections.find((node) => attr(node, 'id') === item.group) ?? sections.at(-1);
    const siblings = section.parentNode.childNodes, next = siblings.slice(siblings.indexOf(section) + 1).find((node) => sections.includes(node) || has(node, 'pager'));
    insert(next ? location(next).startOffset : location(section.parentNode).endTag.startOffset, render(escape(id), item), 8);
    insert(location(toc.get(attr(section, 'id'))).endTag.startOffset, '<a class="reference-toc-endpoint" href="#' + escape(id) + '">' + escape(item.title) + '</a>', 10);
  }
  return { drift, output: edits.reverse().sort((a, b) => b[0] - a[0] || b[1] - a[1])
    .reduce((source, [start, end, value]) => source.slice(0, start) + value + source.slice(end), html) };
}
const { values: { check, out } } = parseArgs({ options: { check: { type: 'boolean' }, out: { type: 'string' } } });
const response = await fetch(process.env.POSTMAN_COLLECTION_URL || config.url, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error('Postman feed returned HTTP ' + response.status);
const { collection, item } = await response.json();
const routes = collect(collection?.item ?? item ?? []);
if (!routes.size) throw new Error('Postman feed yielded zero HTTPS routes');
const target = out ?? reference;
const prior = await readFile(target, 'utf8').catch((error) => { if (out && error.code === 'ENOENT') return null; throw error; });
const html = prior ?? await readFile(reference, 'utf8');
const { output, drift } = sync(html, routes);
console.log('Postman reference: generated content ' + (output === html ? 'current' : 'changed') + ', ' + drift + ' curated entries with drift');
if (check) process.exitCode = Number(output !== html || drift > 0);
else if (output !== prior) {
  const temp = out ? out + '.' + process.pid + '.tmp' : new URL('reference.html.' + process.pid + '.tmp', reference);
  try { await writeFile(temp, output, { flag: 'wx' }); await rename(temp, target); }
  finally { await rm(temp, { force: true }); }
}
