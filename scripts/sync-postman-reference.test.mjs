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
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(feed));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const env = { ...process.env, POSTMAN_COLLECTION_URL: `http://127.0.0.1:${server.address().port}` };
  return { sync: (...flags) => run(process.execPath, [script, '--out', out, ...flags], { env }), read: () => readFile(out, 'utf8') };
}

test('an unchanged collection preserves every byte', async (t) => {
  const site = await setup(t, fixture);
  await site.sync('--check');
  await site.sync();
  assert.equal(await site.read(), original);
});

test('a nested Postman route adds one entry and TOC link with placeholders', async (t) => {
  const push = {
    name: 'Push SMS & test',
    request: {
      method: 'POST',
      url: { raw: 'https://user:secret@example.com/public/1.0/conversations/sms/push?token=secret',
        query: [{ key: 'token', value: 'secret' }, { key: 'disabled', disabled: true }] },
      description: '<p>Send &lt;test&gt; <b>SMS</b>.</p>',
      body: { mode: 'formdata', formdata: [{ key: 'message', value: 'secret', description: '<p>Body &amp; text</p>' }] },
    },
    response: [{ body: 'secret' }],
  };
  const site = await setup(t, { collection: { item: [...fixture.item, { name: 'SMS', item: [
    { name: 'Incoming', item: [push, { ...push, name: 'Duplicate request' }] },
    request('GET', '1.2/conversations/sms', 'http://example.com'),
  ] }] } });
  await assert.rejects(site.sync('--check'), (error) => error.code === 1 && /1 added.+drift/.test(error.stdout));
  assert.equal(await site.read(), original);
  const { stderr } = await site.sync();
  assert.match(stderr, /Skipping non-HTTPS/);
  const html = await site.read();
  assert.match(html, /id="push-sms"[\s\S]*?<span class="method m-post">POST<\/span>Push SMS &amp; test[\s\S]*?Send &lt;test&gt; SMS\./);
  assert.match(html, /<td>message<\/td>\s*<td>Body &amp; text<\/td>/);
  assert.match(html, /\/conversations\/sms\/push\?token=YOUR_TOKEN/);
  assert.match(html, /\$ALIVE5_KEY[\s\S]*?--form-string &#39;message=YOUR_MESSAGE/);
  assert.doesNotMatch(html, /secret|Duplicate request|YOUR_DISABLED|1\.2\/conversations/);
  const block = /^ {8}<div class="endpoint reference-entry" id="push-sms">[\s\S]*?^ {8}<\/div>\n/m;
  const toc = /^ {10}<a class="reference-toc-endpoint" href="#push-sms">Push SMS &amp; test<\/a>\n/m;
  assert.match(html, toc);
  assert.equal(html.replace(block, '').replace(toc, ''), original);
  await site.sync('--check');
});

test('only missing rows are appended to an existing field table', async (t) => {
  const feed = structuredClone(fixture);
  feed.item[2].request.url += '?page=2&new_field=real-value';
  feed.item.push({ name: 'Second live chat example', request: {
    method: 'GET',
    url: { raw: feed.item[2].request.url, query: [{ key: 'new_field', description: 'Literal <field> & text' }] },
  } });
  const site = await setup(t, feed);
  await site.sync();
  const html = await site.read();
  const added = / {14}<tr>\n {16}<td>new_field<\/td>\n {16}<td>Literal &lt;field&gt; &amp; text<\/td>\n {14}<\/tr>\n/;
  assert.match(html, added);
  assert.equal(html.replace(added, ''), original);
  await site.sync('--check');
});

test('an anchor override retains curated content when a method and path change', async (t) => {
  const before = original.replaceAll('send-sms', 'push-sms').replace('method m-post">POST', 'method m-put">PUT');
  const site = await setup(t, { item: [request('POST', '1.0/conversations/sms/push'), ...fixture.item.slice(1)] }, 200, before);
  await site.sync();
  assert.equal(await site.read(), before.replace('method m-put">PUT', 'method m-post">POST')
    .replace('/conversations/sms/send</p>', '/public/1.0/conversations/sms/push</p>'));
  await site.sync('--check');
});

test('a single removal drops its entry and TOC link', async (t) => {
  const site = await setup(t, { item: fixture.item.slice(1) });
  await site.sync();
  assert.doesNotMatch(await site.read(), /(?:id="|href="#)send-sms"/);
  await site.sync('--check');
});

test('more than three removals leave the file untouched', async (t) => {
  const site = await setup(t, { item: fixture.item.slice(4) });
  await assert.rejects(site.sync(), (error) => /Refusing to remove 4 endpoints/.test(error.stderr));
  assert.equal(await site.read(), original);
});

test('a feed error leaves the file untouched', async (t) => {
  const site = await setup(t, fixture, 503);
  await assert.rejects(site.sync(), (error) => /Postman feed returned HTTP 503/.test(error.stderr));
  assert.equal(await site.read(), original);
});

test('a feed with zero HTTPS routes leaves the file untouched', async (t) => {
  const site = await setup(t, { item: [] });
  await assert.rejects(site.sync(), (error) => /zero HTTPS routes/.test(error.stderr));
  assert.equal(await site.read(), original);
});
