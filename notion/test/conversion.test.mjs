import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPage, renderBlocks } from '../render.mjs';
import { plain, rich, parseHTML, walk, attr } from '../html.mjs';
import { ROOT, remapBlocks, navigation } from '../site.mjs';
import { offlineSite } from '../offline.mjs';
import { buildTree } from '../build.mjs';
import { listChildren, seedBlocks, requestBlock } from '../api.mjs';
import { localizeImages, uploadImage, knownImages } from '../media.mjs';

const fixture = await offlineSite(ROOT);
const article = path => {
  const old = fixture.map.pages[path];
  const a = fixture.tree.flatMap(s => s.articles).find(a => a.id === old.id);
  return { blocks: remapBlocks(structuredClone(a.blocks), old.bindings), template: fixture.templates[path] };
};

test('all 21 API-shaped article trees reproduce original HTML and nav', async () => {
  const result = await buildTree(fixture.tree, fixture.map, fixture.templates);
  assert.equal(result.output.size, 22);
  for (const [path, html] of result.output) assert.equal(html, await readFile(`${ROOT}/${path}`, 'utf8'), path);
  assert.deepEqual(result.removed, []);
});

test('edits replace prose and code, insert new blocks, and remove deleted content', () => {
  const { blocks, template } = article('api/authentication.html');
  const p = blocks.find(b => b.type === 'paragraph');
  p.paragraph.rich_text = rich('A newly edited introduction.');
  const codes = blocks.filter(b => b.type === 'code');
  codes[1].code.rich_text = rich('console.log("updated");');
  codes[1].code.caption = rich('Node.js');
  blocks.splice(blocks.indexOf(codes[1]), 0, { id: 'new', type: 'code', code: { rich_text: rich('print("hello")'), caption: rich('Python'), language: 'python' } });
  const h = blocks.find(b => b.type === 'heading_2');
  blocks.splice(blocks.indexOf(h), 1);
  const html = renderPage(blocks, template, 'API credentials');
  assert.match(html, /A newly edited introduction\./);
  assert.match(html, /console\.log\(&quot;updated&quot;\)/);
  assert.match(html, />Python<\/button>/);
  assert.match(html, />Node\.js<\/button>/);
  assert.doesNotMatch(html, /<h2 id="key">/);
  assert.match(html, /<h1>API credentials<\/h1>/);
  const doc = parseHTML(html);
  assert.equal(walk(doc).filter(n => attr(n, 'class') === 'code').length, 1);
});

test('deleting the first block keeps the page heading and breadcrumbs', () => {
  const { blocks, template } = article('api/authentication.html');
  blocks.shift();
  const html = renderPage(blocks, template);
  assert.match(html, /<h1>Authentication<\/h1>/);
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.doesNotMatch(html, /Authenticate requests with your Alive5 API key\./);
});

test('edited table cells and nested list items replace their original content', () => {
  const { blocks, template } = article('connectors/directus.html');
  const table = blocks.find(b => b.type === 'table');
  table.table.children[1].table_row.cells[0] = rich('Changed field');
  const li = blocks.find(b => b.type === 'numbered_list_item' && b.numbered_list_item.children);
  li.numbered_list_item.children[0].paragraph.rich_text = rich('Changed instruction');
  const html = renderPage(blocks, template);
  assert.match(html, /Changed field/);
  assert.match(html, /Changed instruction/);
  assert.doesNotMatch(html, /Copy or generate your/);
});

test('reordered headings follow Notion order and keep their fragment IDs', () => {
  const { blocks, template } = article('api/authentication.html');
  const heading = blocks.find(b => b.type === 'heading_2' && plain(b.heading_2.rich_text) === 'Handling the key');
  blocks.splice(blocks.indexOf(heading), 1); blocks.unshift(heading);
  const html = renderPage(blocks, template);
  assert.ok(html.indexOf('id="handling"') < html.indexOf('id="key"'));
});

test('new pages, duplicate title slugs, deleted pages, and section order drive the build', async () => {
  const tree = structuredClone(fixture.tree);
  tree[1].articles.splice(1, 1);
  tree[1].articles.push({ id: 'new-1', title: 'New guide', blocks: [{ id: 'p1', type: 'paragraph', paragraph: { rich_text: rich('Editable new article') } }] });
  tree[1].articles.push({ id: 'new-2', title: 'New guide', blocks: [] });
  [tree[1], tree[4]] = [tree[4], tree[1]];
  const result = await buildTree(tree, fixture.map, fixture.templates);
  assert.ok(result.removed.includes('api/authentication.html'));
  assert.equal(result.map.pages['new-guide.html'].id, 'new-1');
  assert.equal(result.map.pages['new-guide-2.html'].id, 'new-2');
  const html = result.output.get('new-guide.html');
  assert.ok(html.indexOf('<h1>New guide</h1>') < html.indexOf('Editable new article'));
  assert.match(html, /src="assets\/site.js"/);
  assert.doesNotMatch(html, /Authenticate Alive5 API requests/);
  const nav = navigation(result.output.get('assets/site.js'));
  assert.equal(nav.sidebar[0].label, 'Connectors');
  assert.ok(nav.sidebar.flatMap(g => g.items).some(i => i[1] === 'api/reference.html'));
  const next = await buildTree(tree, result.map, fixture.templates);
  assert.deepEqual([...next.output.keys()], [...result.output.keys()]);
});

test('rich text escapes markup and rejects active URL schemes', () => {
  const p = { id: 'p', type: 'paragraph', paragraph: { rich_text: rich('<script>alert(1)</script>') } };
  assert.match(renderBlocks([p]), /&lt;script&gt;/);
  p.paragraph.rich_text[0].text.link = { url: 'javascript:alert(1)' };
  assert.throws(() => renderBlocks([p]), /Unsupported URL/);
  assert.throws(() => renderBlocks([{ id: 'x', type: 'unsupported', unsupported: {} }]), /Unsupported Notion block/);
});

test('code, tables and image payloads satisfy API limits and hide layout metadata', () => {
  const check = b => {
    const payload = requestBlock(b);
    assert.deepEqual(Object.keys(payload).sort(), ['object', 'type', b.type].sort());
    for (const value of [...(b[b.type].rich_text || []), ...(b[b.type].caption || []), ...(b[b.type].cells || []).flat()]) assert.ok(value.text.content.length <= 2000);
    if (b.type === 'image') assert.match(b.image.external.url, /^https:\/\//);
    for (const child of b[b.type].children || []) check(child);
  };
  for (const a of fixture.tree.flatMap(s => s.articles)) for (const b of a.blocks) check(b);
});

test('pagination retrieves every block', async () => {
  const calls = [];
  const client = { blocks: { children: { list: async args => { calls.push(args); return args.start_cursor ? { results: [{ id: 'second' }], has_more: false } : { results: [{ id: 'first' }], has_more: true, next_cursor: 'cursor' }; } } } };
  assert.deepEqual((await listChildren(client, 'parent')).map(b => b.id), ['first', 'second']);
  assert.equal(calls[1].start_cursor, 'cursor');
});

test('seed batches and resumes without duplicating existing blocks', async () => {
  const source = Array.from({ length: 105 }, (_, i) => ({ id: `local-${i}`, type: 'paragraph', paragraph: { rich_text: rich(`Line ${i}`) } }));
  const stored = [], sizes = [];
  const client = { blocks: { children: {
    list: async () => ({ results: structuredClone(stored), has_more: false }),
    append: async ({ children }) => { sizes.push(children.length); const results = children.map(b => ({ ...b, id: `remote-${stored.length++}` })); stored.splice(stored.length - results.length, results.length, ...results); return { results }; },
  } } };
  const bindings = {};
  await seedBlocks(client, 'page', source, bindings, async () => {});
  assert.deepEqual(sizes, [40, 40, 25]);
  await seedBlocks(client, 'page', source, bindings, async () => {});
  assert.equal(stored.length, 105);
  assert.equal(Object.keys(bindings).length, 105);
});

test('uploaded Notion images use stable local bytes, not expiring signed URLs', async () => {
  const tree = [{ articles: [{ blocks: [{ id: 'i', type: 'image', image: { type: 'file', file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/image.png?expires=soon' }, caption: rich('Diagram') } }] }] }];
  const output = await localizeImages(tree, async () => new Response('image bytes', { headers: { 'content-type': 'image/png' } }));
  assert.equal(output.size, 1);
  assert.match(tree[0].articles[0].blocks[0].image.external.url, /assets\/notion\/[a-f0-9]+\.png$/);
});

test('second builds are stable after additions, deletions, renames, and reorder', async () => {
  const tree = structuredClone(fixture.tree);
  tree[1].articles.splice(1, 1);
  tree[1].title = 'Updated API';
  tree.push({ id: 'new-section', title: 'More guides', articles: [{ id: 'new-page', title: 'A new page', blocks: [] }] });
  const first = await buildTree(tree, fixture.map, fixture.templates);
  const second = await buildTree(tree, first.map, fixture.templates);
  assert.deepEqual([...second.output], [...first.output]);
  assert.deepEqual(second.map, first.map);
});

test('edited linked cards update the link without nesting anchors', () => {
  const { blocks, template } = article('connectors/index.html');
  const b = blocks.find(b => b.type === 'heading_3' && plain(b.heading_3.rich_text).includes('Zapier'));
  b.heading_3.rich_text = rich('Updated card').map(r => ({ ...r, text: { ...r.text, link: { url: 'https://example.com/new' } } }));
  const html = renderPage(blocks, template);
  assert.match(html, /href="https:\/\/example.com\/new"/);
  assert.match(html, /<h3>Updated card<\/h3>/);
});

test('Notion navigation titles cannot inject HTML', async () => {
  const tree = structuredClone(fixture.tree);
  tree[1].title = '<img src=x onerror=alert(1)>';
  tree[1].articles[0].title = '<svg onload=alert(1)>';
  const result = await buildTree(tree, fixture.map, fixture.templates);
  const nav = navigation(result.output.get('assets/site.js'));
  assert.match(nav.sidebar[0].label, /^&lt;img/);
  assert.match(nav.sidebar[0].items[0][2], /^&lt;svg/);
  assert.doesNotMatch(result.output.get('api/index.html'), /<svg onload/);
});

test('local seed illustrations upload through the SDK and retain their original template on readback', async () => {
  const { blocks, template } = article('api/authentication.html');
  const source = blocks.find(b => b.type === 'image' && b.image.external.url.includes('api-key-settings'));
  let uploaded;
  const client = { fileUploads: {
    create: async args => { assert.equal(args.content_type, 'image/png'); return { id: 'upload-id' }; },
    send: async args => { uploaded = Buffer.from(await args.file.data.arrayBuffer()); return { status: 'uploaded' }; },
  } };
  const request = await uploadImage(client, source, ROOT);
  assert.equal(request.image.type, 'file_upload');
  assert.equal(request.image.file_upload.id, 'upload-id');
  const remote = { ...source, image: { type: 'file', file: { url: 'https://s3.us-west-2.amazonaws.com/example.png?signature=temporary' }, caption: source.image.caption } };
  await localizeImages([{ articles: [{ blocks: [remote] }] }], async () => new Response(uploaded, { headers: { 'content-type': 'image/png' } }), await knownImages(ROOT));
  assert.deepEqual(remote.image, source.image);
  assert.equal(renderPage(blocks.map(b => b === source ? remote : b), template), await readFile(`${ROOT}/api/authentication.html`, 'utf8'));
});
