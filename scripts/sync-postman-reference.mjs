import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const config = JSON.parse(await readFile(new URL('./postman-reference.json', import.meta.url), 'utf8'));
const reference = new URL('../api/reference.html', import.meta.url);
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const plain = Object.fromEntries(Object.entries(entities).map(([char, entity]) => [entity, char]));
const escape = (s) => s.replace(/[&<>"']/g, (char) => entities[char]);
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => plain[entity] ?? (entity === '&apos;' ? "'" : ' '));
const description = (value) => {
  const content = typeof value === 'string' ? value : value?.content ?? '';
  return /^\s*<(?:p|div|ul|ol|pre|h[1-6])\b/i.test(content)
    ? decode(content.replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    : content.trim();
};
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const placeholder = (key) => 'YOUR_' + slug(key).replaceAll('-', '_').toUpperCase();
const version = /^\/public\/[\d.]+(?=\/)/;
const badge = (method) => `<span class="method m-${method.toLowerCase()}">${method}</span>`;
const rawExample = (value, key = 'body') => {
  if (Array.isArray(value)) return value.slice(0, 1).map((entry) => rawExample(entry, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map((name) => [name, rawExample(value[name], name)]));
  return typeof value === 'string' ? placeholder(key) : { number: 0, boolean: false }[typeof value] ?? null;
};

function collect(items, routes = new Map(), folder) {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      collect(item.item, routes, folder ?? item.name);
      continue;
    }
    const { method, url, body, description: prose } = item.request ?? {};
    const verb = method?.toUpperCase();
    if (!verb || !/^[A-Z]+$/.test(verb) || !url) throw new Error('Invalid Postman request');
    const address = URL.parse(typeof url === 'string' ? url : url.raw ??
      `${url.protocol}://${url.host?.join('.')}${url.port ? ':' + url.port : ''}/${url.path?.join('/') ?? ''}`);
    if (address?.protocol !== 'https:') { console.warn(`Skipping non-HTTPS Postman request: ${item.name}`); continue; }
    const active = (params) => params.filter(({ disabled, key }) => !disabled && key);
    const query = active(url.query ?? [...address.searchParams.keys()].map((key) => ({ key })));
    const mode = body?.mode;
    const form = active(Array.isArray(body?.[mode]) ? body[mode] : []);
    let json;
    if (mode === 'raw') try { json = rawExample(JSON.parse(body.raw)); } catch { /* Use a generic body placeholder below. */ }
    const path = address.pathname;
    const route = `${verb} ${path}`;
    const fields = routes.get(route)?.fields ?? new Map();
    for (const param of [...query, ...form, ...active(url.variable ?? []),
      ...Object.keys(json && !Array.isArray(json) && typeof json === 'object' ? json : {}).map((key) => ({ key }))]) {
      if (!fields.get(param.key)) fields.set(param.key, description(param.description));
    }
    if (!routes.has(route)) routes.set(route, { route, verb, path, address, group: config.groups[`${verb} ${folder}`] ?? config.groups[folder] ?? 'directory',
      id: config.ids[route] ?? slug(route), title: item.name, prose: description(prose), fields, mode, form, query, json });
  }
  return routes;
}

const row = ([key, prose]) => `              <tr>\n                <td>${escape(key)}</td>\n                <td>${escape(prose)}</td>\n              </tr>\n`;
const table = (fields) => `            <table class="tbl">
              <tr><th>Parameter</th><th>Description</th></tr>
${[...fields].map(row).join('')}            </table>\n`;
function render({ id, verb, path, address, title, prose, fields, query, form, mode, json }) {
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  const queryString = new URLSearchParams(query.map(({ key }) => [key, placeholder(key)])).toString();
  const examplePath = path.replace(/%7B%7B([\w-]+)%7D%7D|(?<=\/):([\w-]+)/gi, (_, name, variable) => placeholder(name ?? variable));
  const curl = [`curl -X ${verb}`, quote(address.origin + examplePath + (queryString ? '?' + queryString : '')), '-H "X-A5-APIKEY: $ALIVE5_KEY"'];
  for (const { key, type } of form) {
    const file = mode === 'formdata' && type === 'file';
    const flag = mode === 'urlencoded' ? '--data-urlencode' : file ? '--form' : '--form-string';
    curl.push(`${flag} ${quote(key + '=' + (file ? '@' : '') + placeholder(key))}`);
  }
  if (mode === 'raw') curl.push(json === undefined ? "--data-raw 'YOUR_REQUEST_BODY'" : `--json ${quote(JSON.stringify(json))}`);
  if (mode === 'file') curl.push("--data-binary '@YOUR_REQUEST_FILE'");
  return `        <div class="endpoint reference-entry" id="${id}">
          <div class="reference-description">
            <h3>${badge(verb)}${escape(title)}</h3>
            <p class="path">${escape(path.replace(version, ''))}</p>
${prose ? `            <p>${escape(prose)}</p>\n` : ''}${fields.size ? table(fields) : ''}          </div>
          <div aria-label="Examples for ${verb} ${escape(title)}" class="reference-examples" role="group">
            <figure class="reference-code">
              <figcaption><span>Request</span><span>curl</span><button class="copy" type="button">Copy</button></figcaption>
              <pre aria-label="curl request for ${verb} ${escape(title)}" tabindex="0"><code>${escape(curl.join(' \\\n  '))}</code></pre>
            </figure>
          </div>
        </div>\n`;
}

const entry = /^ {8}<div class="endpoint reference-entry" id="([\w-]+)">[\s\S]*?^ {8}<\/div>\n/gm;
const tocLink = /^ {10}<a class="reference-toc-endpoint" href="#([\w-]+)">[^\n]*<\/a>\n/gm;
const methodBadge = /<span class="method m-[a-z]+">([A-Z]+)<\/span>/;
const pathLabel = /<p class="path">([^<]+)<\/p>/;
const versionedPath = (block) => {
  const request = block.match(/<code>curl[^<]+/)?.[0] ?? '';
  const requestPath = decode(request).match(/https:\/\/[^/\s"']+(\/public\/[\d.]+)\//)?.[1] ?? '';
  const path = decode(block.match(pathLabel)[1]);
  return version.test(path) ? path : requestPath + path;
};

function sync(html, routes) {
  const current = new Map([...html.matchAll(entry)].map(([block, id]) => [id, `${block.match(methodBadge)[1]} ${versionedPath(block)}`]));
  if (!current.size || current.size !== html.split('class="endpoint reference-entry"').length - 1) throw new Error('Unexpected reference entry markup');
  const byRoute = new Map([...current].map(([id, route]) => [route, id]));
  const links = new Map([...html.matchAll(tocLink)].map(([link, id]) => [id, link]));
  const bindings = new Map(), additions = new Map(), groupLinks = new Map(), added = [], updated = [];
  for (const route of routes.values()) {
    const id = current.has(config.ids[route.route]) ? route.id : byRoute.get(route.route);
    if (id) {
      if (bindings.has(id)) throw new Error(`Conflicting routes for #${id}`);
      bindings.set(id, route);
    } else {
      if (current.has(route.id) || additions.has(route.id)) throw new Error(`Duplicate anchor #${route.id}. Add a Postman id override.`);
      additions.set(route.id, route);
    }
  }
  const removed = [...current].filter(([id]) => !bindings.has(id)).map(([, route]) => route);
  if (removed.length > 3) throw new Error(`Refusing to remove ${removed.length} endpoints (maximum 3)`);
  const output = html.replace(/^( {8}<h2 id="([\w-]+)">[^\n]+<\/h2>\n)([\s\S]*?)(?=^ {8}(?:<h2 |<div class="pager">))/gm, (_, heading, group, body) => {
    const toc = [];
    groupLinks.set(group, toc);
    body = body.replace(entry, (block, id) => {
      if (!bindings.has(id)) return '';
      const route = bindings.get(id);
      bindings.delete(id);
      toc.push(links.get(id) ?? `          <a class="reference-toc-endpoint" href="#${id}">${block.match(/<\/span>([\s\S]*?)<\/h3>/)[1].trim()}</a>\n`);
      const next = block.replace(methodBadge, badge(route.verb))
        .replace(pathLabel, (label) => current.get(id).endsWith(' ' + route.path) ? label : `<p class="path">${escape(route.path)}</p>`)
        .replace(/(<table class="tbl">[\s\S]*?)( {12}<\/table>)/, (_, table, close) => {
        const keys = new Set([...table.matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)].map(([, key]) => decode(key.trim())));
        return table + [...route.fields].filter(([key]) => !keys.has(key)).map(row).join('') + close;
      });
      if (next !== block) updated.push(route.route);
      return next;
    });
    for (const route of additions.values()) {
      if (route.group !== group) continue;
      additions.delete(route.id);
      added.push(route.route);
      body += render(route);
      toc.push(`          <a class="reference-toc-endpoint" href="#${route.id}">${escape(route.title)}</a>\n`);
    }
    return heading + body;
  }).replace(/^( {10}<a class="reference-toc-section" href="#([\w-]+)">[^\n]+<\/a>\n)([\s\S]*?)(?=^ {8}<\/div>)/gm, (_, heading, group) => {
    const toc = groupLinks.get(group);
    groupLinks.delete(group);
    return heading + toc.join('');
  });
  if (bindings.size || groupLinks.size) throw new Error('Unexpected reference section markup');
  if (additions.size) throw new Error('Missing reference group for new Postman routes');
  return { output, added, removed, updated };
}

const { values: { check, out } } = parseArgs({ options: { check: { type: 'boolean' }, out: { type: 'string' } } });
const { POSTMAN_COLLECTION_URL: url, POSTMAN_API_KEY: key, POSTMAN_COLLECTION_UID: uid } = process.env;
const authenticated = !url && key && uid;
const response = await fetch(url || (authenticated ? `https://api.getpostman.com/collections/${encodeURIComponent(uid)}` : config.url), {
  ...(authenticated && { headers: { 'X-Api-Key': key }, redirect: 'error' }), signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Postman feed returned HTTP ${response.status}`);
const { collection, item } = await response.json();
const routes = collect(collection?.item ?? item ?? []);
if (!routes.size) throw new Error('Postman feed yielded zero HTTPS routes');
const target = out ?? reference;
const prior = await readFile(target, 'utf8').catch((error) => {
  if (out && error.code === 'ENOENT') return null;
  throw error;
});
const html = prior ?? await readFile(reference, 'utf8');
const { output, added, removed, updated } = sync(html, routes);
console.log(`Postman reference: ${added.length} added, ${removed.length} removed, ${updated.length} updated${output !== html ? ' (drift)' : ''}`);
for (const [label, values] of [['+', added], ['-', removed], ['~', updated]]) {
  for (const value of values) console.log(`  ${label} ${value}`);
}
if (check) process.exitCode = Number(output !== html);
else if (output !== prior) {
  const temp = out ? `${out}.${process.pid}.tmp` : new URL(`reference.html.${process.pid}.tmp`, reference);
  try { await writeFile(temp, output, { flag: 'wx' }); await rename(temp, target); }
  finally { await rm(temp, { force: true }); }
}
