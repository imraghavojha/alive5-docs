import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./sync-postman-reference.mjs', import.meta.url));
const request = (method, path, host = 'https://api.alive5.com') => ({
  name: path, request: { method, url: host + '/public/' + path },
});
const groups = {
  messaging: [
    ['send-sms', 'POST', '1.0/conversations/sms/send'],
    ['sms-conversations', 'GET', '1.0/conversations/sms'],
    ['livechat', 'GET', '2.0/conversations/livechat'],
  ],
  directory: [['account', 'GET', '1.0/account']],
  'account-setup': [['create-channel', 'POST', '1.0/create/channel']],
  reporting: [['performance', 'GET', '1.0/performance-reporting']],
};
const fixture = { item: Object.values(groups).flat().map(([, method, route]) => request(method, route)) };
const original = Object.entries(groups).map(([group, entries]) =>
  `        <h2 id="${group}">${group}</h2>\n` + entries.map(([id, method, route]) => `        <div class="endpoint reference-entry" id="${id}">
          <div class="reference-description">
            <h3><span class="method m-${method.toLowerCase()}">${method}</span>Curated ${id}</h3>
            <p class="path">${route.slice(route.indexOf('/'))}</p>
            <p>Curated description.</p>
${id === 'livechat' ? `            <table class="tbl">
              <tr><th>Parameter</th><th>Description</th></tr>
              <tr><td>page</td><td>Curated page field.</td></tr>
            </table>\n` : ''}          </div>
          <div class="reference-examples"><pre><code>curl -X ${method} "https://api.alive5.com/public/${route}"</code></pre></div>
        </div>\n`).join('')).join('') + '        <div class="pager"></div>\n' +
  Object.entries(groups).map(([group, entries]) => `        <div class="reference-toc-group">
          <a class="reference-toc-section" href="#${group}">${group}</a>
${entries.map(([id]) => `          <a class="reference-toc-endpoint" href="#${id}">Curated ${id}</a>\n`).join('')}        </div>\n`).join('');

async function setup(t, feed, status = 200, html = original) {
  const dir = await mkdtemp(join(tmpdir(), 'alive5-postman-'));
  const out = join(dir, 'reference.html');
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(out, html);
  let current = feed;
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(typeof current === 'string' ? current : JSON.stringify(current));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const env = { ...process.env, POSTMAN_COLLECTION_URL: `http://127.0.0.1:${server.address().port}` };
  return {
    sync: (...flags) => run(process.execPath, [script, '--out', out, ...flags], { env }),
    setFeed: (next) => { current = next; },
    read: () => readFile(out, 'utf8'),
  };
}

test('an unchanged collection preserves every byte', async (t) => {
  const site = await setup(t, fixture);
  await site.sync('--check');
  await site.sync();
  assert.equal(await site.read(), original);
});

const push = {
  name: 'Push SMS',
  request: {
    method: 'POST',
    url: 'https://api.alive5.com/public/1.0/conversations/sms/push?token=secret',
    description: '<p>Send &lt;test&gt; <b>SMS</b>.</p>',
    body: { mode: 'formdata', formdata: [{ key: 'message', value: 'secret' }] },
  },
  response: [{ body: 'secret' }],
};
const withRequests = (folder, ...items) => ({ item: [...fixture.item, { name: folder, item: items }] });
const pushEntry = /^ {8}<div class="endpoint reference-entry" id="push-sms" data-postman>[\s\S]*?^ {8}<\/div>\n/m;
const pushLink = /^ {10}<a class="reference-toc-endpoint" href="#push-sms">Push SMS<\/a>\n/m;

test('the Documenter feed shape adds the first HTTPS request and its TOC link idempotently', async (t) => {
  const duplicate = { name: 'Duplicate request', request: { ...push.request, description: 'Duplicate description',
    body: { mode: 'formdata', formdata: [{ key: 'duplicate_field' }] } } };
  const site = await setup(t, withRequests('SMS', { name: 'Incoming', item: [push, duplicate] },
    request('GET', '1.2/conversations/sms', 'http://example.com')));
  await assert.rejects(site.sync('--check'), (error) => error.code === 1 && /generated content changed/.test(error.stdout));
  assert.equal(await site.read(), original);
  const { stderr } = await site.sync();
  assert.match(stderr, /::warning::Skipping non-HTTPS/);
  const html = await site.read(), block = html.match(pushEntry)?.[0];
  assert.ok(block);
  assert.match(block, /<span class="method m-post">POST<\/span>Push SMS/);
  assert.match(block, /<p>Send &lt;test&gt; SMS\.<\/p>/);
  assert.match(block, /&quot;https:\/\/api\.alive5\.com\/public\/1\.0\/conversations\/sms\/push\?token=YOUR_TOKEN&quot;/);
  assert.match(block, /-H &quot;X-A5-APIKEY: \$ALIVE5_KEY&quot;[\s\S]*?--form-string &quot;message=YOUR_MESSAGE&quot;/);
  assert.doesNotMatch(block, /<table|secret|Duplicate|duplicate_field/);
  assert.match(html, pushLink);
  assert.ok(html.indexOf(block) < html.indexOf('<h2 id="directory">'));
  assert.equal(html.replace(pushEntry, '').replace(pushLink, ''), original);
  await site.sync('--check');
  assert.match((await site.sync()).stdout, /generated content current/);
  assert.equal(await site.read(), html);
});

test('changed and missing curated routes warn without rewriting the curated entries or links', async (t) => {
  const moved = { ...request('PUT', '1.1/conversations/sms/send'), name: 'Moved send' };
  const feed = { collection: { item: [...fixture.item.slice(2), { name: 'SMS', item: [moved] }] } };
  const site = await setup(t, feed);
  const { stderr } = await site.sync();
  assert.match(stderr, /::warning::#send-sms POST \/public\/1\.0\/conversations\/sms\/send is missing from Postman/);
  assert.match(stderr, /::warning::#sms-conversations GET \/public\/1\.0\/conversations\/sms is missing from Postman/);
  const html = await site.read();
  assert.equal(html.replace(/^ {8}<div class="endpoint reference-entry" id="moved-send" data-postman>[\s\S]*?^ {8}<\/div>\n/m, '')
    .replace(/^ {10}<a class="reference-toc-endpoint" href="#moved-send">Moved send<\/a>\n/m, ''), original);
  await assert.rejects(site.sync('--check'), (error) => error.code === 1 && /generated content current, 2 curated entries with drift/.test(error.stdout));
  assert.equal(await site.read(), html);
});

test('only missing first-request parameters warn and curated prose and tables remain byte-identical', async (t) => {
  const feed = structuredClone(fixture);
  feed.item[2].request.url += '?page=2&new_field=real-value';
  feed.item.push({ name: 'Second live chat example', request: {
    method: 'GET', url: { raw: feed.item[2].request.url, query: [{ key: 'duplicate_field' }] },
  } });
  const html = original.replace('Curated livechat</h3>\n            <p class="path">/conversations/livechat</p>\n            <p>Curated description.',
    'Curated livechat</h3>\n            <p class="path">/conversations/livechat</p>\n            <p>Curated description with new_field_extra.');
  const site = await setup(t, feed, 200, html);
  const { stderr } = await site.sync();
  assert.match(stderr, /::warning::#livechat .* is missing Postman parameters new_field\n/);
  assert.doesNotMatch(stderr, /duplicate_field/);
  await assert.rejects(site.sync('--check'), (error) => error.code === 1);
  assert.equal(await site.read(), html);
});

test('a renamed request keeps its generated anchor, even when a new route wants the same id', async (t) => {
  const site = await setup(t, withRequests('SMS', push));
  await site.sync();
  const before = await site.read();
  assert.match(before, pushEntry);
  assert.match(before, pushLink);
  site.setFeed(withRequests('SMS', { ...push, request: { ...push.request, method: 'GET' } }, {
    ...push, name: 'Renamed SMS', request: { ...push.request, description: 'New Postman description.' },
  }));
  await site.sync();
  const renamed = await site.read();
  assert.match(renamed.match(pushEntry)?.[0] ?? '', /POST<\/span>Renamed SMS[\s\S]*?New Postman description/);
  assert.match(renamed, /href="#push-sms">Renamed SMS<\/a>/);
  assert.match(renamed, /id="get-push-sms" data-postman>[\s\S]*?GET<\/span>Push SMS/);
  assert.match(renamed, /href="#get-push-sms">Push SMS<\/a>/);
  assert.doesNotMatch(renamed, /(?:id="|href="#)renamed-sms"/);
  await site.sync('--check');
  site.setFeed(fixture);
  await assert.rejects(site.sync('--check'), (error) => error.code === 1);
  await site.sync();
  assert.equal(await site.read(), original);
  await site.sync('--check');
});

test('removing the marker adopts an entry and its TOC link', async (t) => {
  const site = await setup(t, withRequests('SMS', push));
  await site.sync();
  const adopted = (await site.read()).replace(' data-postman', '').replace('Send &lt;test&gt; SMS.', 'Curated note.');
  const edited = await setup(t, withRequests('SMS', push), 200, adopted);
  await edited.sync('--check');
  edited.setFeed(fixture);
  assert.match((await edited.sync()).stderr, /::warning::#push-sms .* is missing from Postman/);
  assert.equal(await edited.read(), adopted);
});

test('path variables display decoded and request text is escaped', async (t) => {
  const feed = withRequests('Unmapped folder', {
    name: '<img src=x onerror=alert(1)>',
    request: { method: 'PUT',
      url: { protocol: 'https', host: ['example', 'com'], path: ['public', '1.0', 'contact', '{{id}}', ':type'] },
      description: { content: '<script>alert(2)</script> & "test"' },
      body: { mode: 'raw', raw: '{"name":"secret","city":"private"}' },
    },
  });
  const site = await setup(t, feed);
  await site.sync();
  const html = await site.read();
  assert.match(html, /<h2 id="reporting">[\s\S]*?data-postman[\s\S]*?&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<p class="path">\/contact\/\{\{id\}\}\/:type<\/p>/);
  assert.match(html, /<p>&lt;script&gt;alert\(2\)&lt;\/script&gt; &amp; &quot;test&quot;<\/p>/);
  assert.match(html, /&quot;https:\/\/example\.com\/public\/1\.0\/contact\/YOUR_ID\/YOUR_TYPE&quot;/);
  assert.match(html, /--json &#39;\{&quot;name&quot;:&quot;YOUR_NAME&quot;,&quot;city&quot;:&quot;YOUR_CITY&quot;\}&#39;/);
  assert.doesNotMatch(html, /<img|<script|secret|private|%7B|%7D/);
  await site.sync('--check');
});

test('attribute order, quoting, and class order variations in curated markup preserve all bytes', async (t) => {
  const html = original.replace('<div class="endpoint reference-entry" id="send-sms">', "<div id='send-sms' class='featured reference-entry  endpoint'>")
    .replace('<span class="method m-post">', '<span data-test class="m-post method">')
    .replace('<p class="path">', "<p title='path' class='path'>")
    .replace('<a class="reference-toc-endpoint" href="#send-sms">', "<a href='#send-sms' class='custom reference-toc-endpoint'>");
  const site = await setup(t, fixture, 200, html);
  await site.sync('--check');
  await site.sync();
  assert.equal(await site.read(), html);
});

test('generated anchors deduplicate against any existing id and urlencoded fields use data-urlencode', async (t) => {
  const feed = withRequests('SMS', ...['collision', 'repeat', 'empty'].map((path) => ({
    name: path === 'empty' ? '💬' : 'Send SMS',
    request: { ...request('POST', '1.0/' + path).request,
      body: { mode: 'urlencoded', urlencoded: [{ key: 'active', value: 'secret' }, { key: 'disabled', disabled: true }] },
    },
  })));
  const originalWithId = original.replace('<div class="pager">', '<div class="pager" id="post-send-sms">');
  const site = await setup(t, feed, 200, originalWithId);
  await site.sync();
  const html = await site.read();
  assert.deepEqual([...html.matchAll(/id="([^"]+)" data-postman/g)].map(([, id]) => id), ['post-send-sms-2', 'post-send-sms-3', 'post']);
  assert.match(html, /--data-urlencode &quot;active=YOUR_ACTIVE&quot;/);
  assert.doesNotMatch(html, /--form|disabled|secret/);
  await site.sync('--check');
});

test('multipart uploads, raw text, and file bodies use their matching curl flags', async (t) => {
  const site = await setup(t, withRequests('SMS', ...[
    ['multipart', { mode: 'formdata', formdata: [
      { key: 'message', value: 'secret' },
      { key: 'attachment', type: 'file', src: '/private/secret.pdf' },
      { key: 'disabled', type: 'file', disabled: true },
    ] }],
    ['raw-text', { mode: 'raw', raw: '<body>secret</body>' }],
    ['file', { mode: 'file', file: { src: '/private/secret.pdf' } }],
  ].map(([name, body]) => ({ name, request: { ...request('POST', '1.0/' + name).request, body } }))));
  await site.sync();
  const html = await site.read();
  assert.deepEqual(html.match(/--(?:form(?:-string)?|data-[\w-]+|json) [^\n<]+/g).map((flag) => flag.replace(/ \\$/, '')), [
    '--form-string &quot;message=YOUR_MESSAGE&quot;',
    '--form &quot;attachment=@YOUR_ATTACHMENT_FILE&quot;',
    '--data-raw &quot;YOUR_REQUEST_BODY&quot;',
    '--data-binary &quot;@YOUR_REQUEST_FILE&quot;',
  ]);
  assert.doesNotMatch(html, /disabled|secret|private/);
  await site.sync('--check');
});

for (const [name, feed, status, message] of [
  ['an HTTP error', fixture, 503, /Postman feed returned HTTP 503/],
  ['invalid JSON', '{"item":', 200, /SyntaxError/],
  ['zero routes', { item: [] }, 200, /zero HTTPS routes/],
]) {
  test(name + ' exits 1 and leaves the file untouched', async (t) => {
    const site = await setup(t, feed, status);
    await assert.rejects(site.sync(), (error) => error.code === 1 && message.test(error.stderr));
    assert.equal(await site.read(), original);
  });
}
