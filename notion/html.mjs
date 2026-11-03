import { parse, parseFragment } from 'parse5';
import { createHash } from 'node:crypto';

export const BASE = 'https://imraghavojha.github.io/alive5-docs/';
export const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value || '';
export const hasClass = (node, name) => attr(node, 'class').split(/\s+/).includes(name);
export const children = node => node.childNodes || [];
export const walk = node => [node, ...children(node).flatMap(walk)];
export const text = node => node.nodeName === '#text' ? node.value : children(node).map(text).join('');
export const plain = rich => (rich || []).map(r => r.text?.content ?? r.plain_text ?? '').join('');
export const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const slug = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const parseHTML = html => parse(html, { sourceCodeLocationInfo: true });
export const fragment = html => parseFragment(html, { sourceCodeLocationInfo: true });
export const rich = value => String(value).match(/[\s\S]{1,2000}/g)?.map(content => ({ type: 'text', text: { content } })) || [];
export function safeURL(value) {
  if (!/^(https?:|mailto:|tel:|#|\.?\.?\/)/i.test(value) && /^[a-z][\w+.-]*:/i.test(value)) throw new Error(`Unsupported URL protocol: ${value.split(':')[0]}`);
  return value;
}
export function richText(node, path, inherited) {
  if (!inherited) {
    let parent = node.parentNode;
    while (parent && parent.tagName !== 'a') parent = parent.parentNode;
    inherited = parent ? { link: new URL(attr(parent, 'href'), BASE + path).href } : {};
  }
  if (node.nodeName === '#text') return rich(node.value.replace(/\s+/g, ' ')).map(r => ({ ...r, ...inherited }));
  if (node.tagName === 'br') return rich('\n');
  if (['svg', 'button'].includes(node.tagName) || attr(node, 'aria-hidden') === 'true') return [];
  const annotations = { ...inherited.annotations };
  const mark = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', code: 'code', s: 'strikethrough', u: 'underline' }[node.tagName];
  if (mark) annotations[mark] = true;
  const link = node.tagName === 'a' ? new URL(attr(node, 'href'), BASE + path).href : inherited.link;
  const result = children(node).flatMap(n => richText(n, path, { ...(Object.keys(annotations).length ? { annotations } : {}), ...(link ? { link } : {}) }));
  return result.map(({ link: url, ...r }) => url ? { ...r, text: { ...r.text, link: { url } } } : r);
}
export function normalizeRich(values = []) {
  const result = [];
  for (const r of values) {
    const a = Object.fromEntries(Object.entries(r.annotations || {}).filter(([k, v]) => v && !(k === 'color' && v === 'default')).sort());
    const entry = { text: r.text?.content ?? r.plain_text ?? '', link: r.text?.link?.url ?? r.href ?? null, annotations: a };
    const previous = result.at(-1);
    if (previous && previous.link === entry.link && JSON.stringify(previous.annotations) === JSON.stringify(a)) previous.text += entry.text;
    else result.push(entry);
  }
  return result;
}
export function signature(block) {
  const d = block[block.type];
  return digest({ type: block.type, rich: normalizeRich(d.rich_text), caption: normalizeRich(d.caption), language: d.language,
    cells: d.cells?.map(normalizeRich), url: d.external?.url || d.file?.url, width: d.table_width,
    header: d.has_column_header, rowHeader: d.has_row_header });
}
export function renderRich(values, path = 'index.html', inLink = false) {
  return (values || []).map(r => {
    let out = escape(r.text?.content ?? r.plain_text ?? '');
    const a = r.annotations || {};
    for (const [key, tag] of Object.entries({ code: 'code', bold: 'strong', italic: 'em', strikethrough: 's', underline: 'u' })) if (a[key]) out = `<${tag}>${out}</${tag}>`;
    const url = r.text?.link?.url ?? r.href;
    if (url && !inLink) out = `<a href="${escape(siteURL(safeURL(url), path))}">${out}</a>`;
    return out;
  }).join('');
}
export function siteURL(url, path) {
  if (!url.startsWith(BASE)) return url;
  const dest = url.slice(BASE.length) || 'index.html';
  return '../'.repeat(path.split('/').length - 1) + dest;
}
