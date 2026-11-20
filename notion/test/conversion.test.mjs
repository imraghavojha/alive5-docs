import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { renderPage, renderBlocks } from '../render.mjs';
import { plain, rich, parseHTML, walk, attr, text } from '../html.mjs';
import { ROOT, remapBlocks, navigation } from '../site.mjs';
import { offlineSite } from '../offline.mjs';
import { buildTree } from '../build.mjs';
import { listChildren, seedBlocks, requestBlock } from '../api.mjs';
import { localizeImages, uploadImage, knownImages } from '../media.mjs';
import { convert } from '../convert.mjs';

const fixture = await offlineSite(ROOT);
const article = path => {
  const old = fixture.map.pages[path];
  const a = fixture.tree.flatMap(s => s.articles).find(a => a.id === old.id);
  return { blocks: remapBlocks(structuredClone(a.blocks), old.bindings), template: fixture.templates[path] };
};

test('offline build reproduces all 21 guides, the API reference, nav, and sitemap bytes', async () => {
  const result = await buildTree(fixture.tree, fixture.map, fixture.templates);
  const paths = [...Object.keys(fixture.map.pages), 'api/reference.html', 'assets/site.js', 'sitemap.xml'];
  assert.equal(result.output.size, paths.length);
  for (const path of paths) assert.deepEqual(Buffer.from(result.output.get(path)), await readFile(`${ROOT}/${path}`), path);
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

test('renaming a guide updates its breadcrumb and map, and keeps the second build stable', async () => {
  const tree = structuredClone(fixture.tree);
  const path = 'api/authentication.html';
  const title = 'Keys & access';
  tree[1].articles.find(a => a.id === fixture.map.pages[path].id).title = title;
  const first = await buildTree(tree, fixture.map, fixture.templates);
  assert.equal(first.map.pages[path].title, title);
  assert.equal(first.map.pages[path].label, title);
  assert.match(first.output.get(path), /<h1>Keys &amp; access<\/h1>/);
  assert.match(first.output.get(path), /<li aria-current="page">Keys &amp; access<\/li>/);
  assert.match(first.output.get('api/index.html'), /Keys &amp; access →/);
  assert.ok(navigation(first.output.get('assets/site.js')).sidebar.flatMap(s => s.items).some(([, href, label]) => href === path && label === 'Keys &amp; access'));
  const second = await buildTree(tree, first.map, fixture.templates);
  assert.deepEqual(second, first);
});

test('renaming a guide preserves its custom label in the map, sidebar, and pagers', async () => {
  const tree = structuredClone(fixture.tree);
  const path = 'api/sms-limits.html';
  const title = 'Messaging quotas and compliance';
  tree.flatMap(s => s.articles).find(a => a.id === fixture.map.pages[path].id).title = title;
  const result = await buildTree(tree, fixture.map, fixture.templates);
  assert.equal(result.map.pages[path].title, title);
  assert.equal(result.map.pages[path].label, 'SMS limits');
  const sidebar = navigation(result.output.get('assets/site.js')).sidebar;
  assert.equal(sidebar.flatMap(s => s.items).find(([, href]) => href === path)[2], 'SMS limits');
  assert.match(result.output.get('api/send-a-message.html'), /<strong>SMS limits →<\/strong>/);
  assert.match(result.output.get('api/receive-messages.html'), /<strong>← SMS limits<\/strong>/);
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

const tableFixture = (head, body) => convert(`<main><h1>Title</h1><table>${head}<tbody>${body}</tbody></table></main>`, 'index.html');

test('column headers can be enabled and disabled for cached rows', () => {
  const body = '<tr><td class="keep">Body</td><td>Detail</td></tr>';
  const enabled = tableFixture('', `<tr><td>First</td><td>Second</td></tr>${body}`);
  enabled.blocks[0].table.has_column_header = true;
  assert.match(renderPage(enabled.blocks, enabled.template), new RegExp(`<thead><tr><th>First</th><th>Second</th></tr></thead><tbody>${body}</tbody>`));

  const disabled = tableFixture('<thead><tr><th>First</th><th>Second</th></tr></thead>', body);
  disabled.blocks[0].table.has_column_header = false;
  assert.match(renderPage(disabled.blocks, disabled.template), new RegExp(`<tbody><tr><td>First</td><td>Second</td></tr>${body}</tbody>`));
});

test('row header changes check both cached tables and cached rows in legacy templates', () => {
  const { blocks, template } = tableFixture('', '<tr><td>One</td><td class="keep">Two</td></tr><tr><th>Three</th><td>Four</td></tr>');
  const table = blocks[0].table;
  delete template.leaves[blocks[0].id].headerFlags;
  assert.ok(!table.has_row_header);
  assert.match(renderPage(blocks, template), /<tbody><tr><td>One<\/td><td class="keep">Two<\/td><\/tr><tr><th>Three<\/th><td>Four<\/td><\/tr><\/tbody>/);
  table.has_row_header = true;
  assert.match(renderPage(blocks, template), /<tbody><tr><th>One<\/th><td class="keep">Two<\/td><\/tr><tr><th>Three<\/th><td>Four<\/td><\/tr><\/tbody>/);
});

test('mixed headers round-trip exactly and only an edited row is normalized', () => {
  const head = '<tr><th scope="col">One</th><td>Two</td></tr>';
  const unedited = '<tr class="keep"><th scope="row">Three&nbsp;</th><td>Four</td></tr>';
  const edited = '<tr><th>Five</th><td>Six</td></tr>';
  const source = `<main><h1>Title</h1><table class="mixed">\n<thead>${head}</thead>\n<tbody>${unedited}${edited}</tbody></table></main>`;
  const { blocks, template } = convert(source, 'index.html');
  assert.equal(renderPage(blocks, template), source);

  blocks[0].table.children[2].table_row.cells[1] = rich('Updated');
  const html = renderPage(blocks, template);
  assert.ok(html.includes(`<thead>${head}</thead><tbody>${unedited}<tr><td>Five</td><td>Updated</td></tr></tbody>`));
});

test('reordering cached rows rebuilds cells that enter or leave the header', () => {
  const { blocks, template } = tableFixture('<thead><tr><th>First</th><th>Second</th></tr></thead>', '<tr><td>One</td><td>Two</td></tr><tr><td class="keep">Three</td><td>Four</td></tr>');
  const rows = blocks[0].table.children;
  [rows[0], rows[1]] = [rows[1], rows[0]];
  assert.match(renderPage(blocks, template), /<thead><tr><th>One<\/th><th>Two<\/th><\/tr><\/thead><tbody><tr><td>First<\/td><td>Second<\/td><\/tr><tr><td class="keep">Three<\/td><td>Four<\/td><\/tr><\/tbody>/);
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
  tree[1].articles.push({ id: 'new-2', title: 'New guide', blocks: [{ id: 'intro', type: 'paragraph', paragraph: { rich_text: rich('Introduction') } }] });
  [tree[1], tree[4]] = [tree[4], tree[1]];
  const result = await buildTree(tree, fixture.map, fixture.templates);
  assert.ok(result.removed.includes('api/authentication.html'));
  assert.equal(result.map.pages['new-guide.html'].id, 'new-1');
  assert.equal(result.map.pages['new-guide-2.html'].id, 'new-2');
  const sitemap = result.output.get('sitemap.xml');
  assert.match(sitemap, /\/new-guide\.html<\/loc>/);
  assert.match(sitemap, /\/new-guide-2\.html<\/loc>/);
  assert.doesNotMatch(sitemap, /\/(?:api\/authentication|404)\.html<\/loc>/);
  const html = result.output.get('new-guide.html');
  assert.ok(html.indexOf('<h1>New guide</h1>') < html.indexOf('Editable new article'));
  assert.match(html, /src="assets\/site.js"/);
  assert.doesNotMatch(html, /Authenticate Alive5 API requests/);
  const nav = navigation(result.output.get('assets/site.js'));
  assert.equal(nav.sidebar[0].label, 'Connectors');
  assert.ok(nav.sidebar.flatMap(g => g.items).some(i => i[1] === 'api/reference.html'));
  const next = await buildTree(tree, result.map, fixture.templates);
  assert.deepEqual([...next.output.keys()], [...result.output.keys()]);
  assert.equal(next.output.get('sitemap.xml'), sitemap);
});

test('deleting the guide before the API reference changes only the reference pager', async () => {
  const path = 'api/reference.html';
  const original = await readFile(`${ROOT}/${path}`, 'utf8');
  const map = { ...fixture.map, order: Object.keys(fixture.map.pages) };
  const unchanged = await buildTree(fixture.tree, map, fixture.templates);
  assert.equal(unchanged.output.get(path), original);

  const tree = structuredClone(fixture.tree);
  const reporting = fixture.map.pages['api/reporting.html'].id;
  const section = tree.find(s => s.articles.some(a => a.id === reporting));
  section.articles = section.articles.filter(a => a.id !== reporting);
  const result = await buildTree(tree, map, fixture.templates);
  assert.deepEqual(result.removed, ['api/reporting.html']);
  const pager = '<div class="pager"><a href="../api/contacts.html"><span>Previous</span><strong>← Contacts</strong></a>' +
    '<a class="next" href="../connectors/index.html"><span>Next</span><strong>Overview →</strong></a></div>';
  assert.equal(result.output.get(path), original.replace(/<div class="pager">[\s\S]*?<\/div>/, pager));
});

test('new guides have a section breadcrumb and link to both neighbors', async () => {
  const tree = structuredClone(fixture.tree);
  const section = tree.find(s => s.title === 'Connectors');
  const title = 'A & B guide';
  section.articles.splice(2, 0, { id: 'new-guide', title, blocks: [{ id: 'intro', type: 'paragraph', paragraph: { rich_text: rich('Introduction') } }] });
  const result = await buildTree(tree, fixture.map, fixture.templates);
  const nodes = walk(parseHTML(result.output.get('a-b-guide.html')));
  const crumbs = nodes.find(n => n.tagName === 'nav' && attr(n, 'class') === 'crumbs');
  assert.equal(attr(crumbs, 'aria-label'), 'Breadcrumb');
  assert.deepEqual(walk(crumbs).filter(n => n.tagName === 'a').map(n => [attr(n, 'href'), text(n)]), [
    ['index.html', 'Home'], ['connectors/index.html', 'Connectors'],
  ]);
  assert.equal(text(walk(crumbs).find(n => attr(n, 'aria-current') === 'page')), title);
  const pager = nodes.find(n => n.tagName === 'div' && attr(n, 'class') === 'pager');
  assert.deepEqual(walk(pager).filter(n => n.tagName === 'a').map(n => [attr(n, 'href'), text(walk(n).find(c => c.tagName === 'strong'))]), [
    ['connectors/zapier.html', '← Zapier'], ['connectors/n8n.html', 'n8n →'],
  ]);
  assert.match(result.output.get('connectors/zapier.html'), /href="\.\.\/a-b-guide\.html"/);
  assert.match(result.output.get('connectors/n8n.html'), /href="\.\.\/a-b-guide\.html"/);
});

test('rich text escapes markup and rejects active URL schemes', () => {
  const p = { id: 'p', type: 'paragraph', paragraph: { rich_text: rich('<script>alert(1)</script>') } };
  assert.match(renderBlocks([p]), /&lt;script&gt;/);
  p.paragraph.rich_text[0].text.link = { url: 'javascript:alert(1)' };
  assert.equal(renderBlocks([p]), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
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

test('scripted uploaded SVGs are skipped with a warning and never published', async t => {
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  const tree = structuredClone(fixture.tree);
  const blocks = tree[1].articles[0].blocks;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>';
  for (const ext of ['svg', 'png']) blocks.push({ id: `uploaded-${ext}`, type: 'image', image: { type: 'file', file: { url: `https://prod-files-secure.s3.us-west-2.amazonaws.com/image.${ext}` }, caption: [] } });
  const images = await localizeImages(tree, async url => url.pathname.endsWith('.svg')
    ? new Response(svg, { headers: { 'content-type': 'image/svg+xml' } })
    : new Response('safe image bytes', { headers: { 'content-type': 'image/png' } }));
  const result = await buildTree(tree, fixture.map, fixture.templates);
  for (const [path, bytes] of images) result.output.set(path, bytes);
  assert.equal(images.size, 1);
  assert.ok([...images.keys()].every(path => path.endsWith('.png')));
  assert.ok(!blocks.some(b => b.id === 'uploaded-svg'));
  assert.ok(blocks.some(b => b.id === 'uploaded-png' && b.image.type === 'external'));
  assert.deepEqual(warnings, ['Skipping uploaded image uploaded-svg: unsupported image type image/svg+xml.']);
  for (const [path, data] of result.output) {
    assert.ok(!path.endsWith('.svg'));
    assert.ok(!data.toString().includes(svg));
  }
  assert.doesNotMatch(result.output.get('api/index.html'), /amazonaws\.com\/image\.svg/);
});

test('second builds are stable after additions, deletions, renames, and reorder', async t => {
  const tree = structuredClone(fixture.tree);
  tree[1].articles.splice(1, 1);
  tree[1].title = 'Updated API';
  tree.push({ id: 'new-section', title: 'More guides', articles: [{ id: 'new-page', title: 'A new page', blocks: [{ id: 'intro', type: 'paragraph', paragraph: { rich_text: rich('Introduction') } }] }] });
  const first = await buildTree(tree, fixture.map, fixture.templates);
  const root = await mkdtemp(join(tmpdir(), 'notion-build-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['assets/site.js', 'api/reference.html', 'sitemap.xml']) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, first.output.get(path));
  }
  const second = await buildTree(tree, first.map, fixture.templates, root);
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
  const path = 'api/authentication.html';
  tree[1].articles.find(a => a.id === fixture.map.pages[path].id).title = '<svg onload=alert(1)>';
  const result = await buildTree(tree, fixture.map, fixture.templates);
  const nav = navigation(result.output.get('assets/site.js'));
  assert.match(nav.sidebar[0].label, /^&lt;img/);
  assert.match(nav.sidebar[0].items.find(([, href]) => href === path)[2], /^&lt;svg/);
  assert.doesNotMatch(result.output.get(path), /<svg onload/);
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
