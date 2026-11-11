import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const port = 3148;
const base = `http://127.0.0.1:${port}`;
let app;

async function waitForApp() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/releases`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Shipnote did not start in time.');
}

before(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shipnote-test-'));
  app = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_FILE: join(directory, 'shipnote.json') } });
  await waitForApp();
});

after(() => app.kill());

test('the live app serves the editing workspace, setup guide and health check', async () => {
  const [workspace, connectorGuide, health] = await Promise.all([
    fetch(`${base}/`), fetch(`${base}/connect`), fetch(`${base}/health`)
  ]);
  assert.equal(workspace.status, 200);
  assert.match(await workspace.text(), /Release desk/);
  assert.equal(connectorGuide.status, 200);
  assert.match(await connectorGuide.text(), /Add custom connector/);
  assert.deepEqual(await health.json(), { ok: true });
});

test('Claude can discover tools and create a real editable draft', async () => {
  const client = new Client({ name: 'shipnote-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ['create_release', 'get_release', 'list_releases', 'publish_release', 'update_release']);

  const created = await client.callTool({
    name: 'create_release',
    arguments: {
      title: 'Faster reporting for every team', version: 'v2.4', category: 'Improved',
      summary: 'Reporting dashboards load in less time, even for larger workspaces.',
      body: 'We rebuilt our reporting queries to put the most useful numbers in reach sooner.\n\nYou will notice faster dashboard loads across your workspace while keeping every existing report and filter exactly where it is.',
      publish: false
    }
  });
  assert.match(created.content[0].text, /Created draft release/);
  await client.close();

  const releases = await fetch(`${base}/api/releases`).then((response) => response.json());
  const release = releases.find((item) => item.title === 'Faster reporting for every team');
  assert.equal(release.status, 'draft');
  assert.ok(release.id);
});

test('a human can edit and publish that release from the app API', async () => {
  const releases = await fetch(`${base}/api/releases`).then((response) => response.json());
  const release = releases.find((item) => item.title === 'Faster reporting for every team');
  const response = await fetch(`${base}/api/releases/${release.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...release, title: 'Fast reporting, without the wait', summary: 'Dashboards now feel immediate for every team, including large workspaces.', status: 'published' })
  });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.status, 'published');
  const publicPage = await fetch(`${base}/r/${updated.slug}`).then((page) => page.text());
  assert.match(publicPage, /Fast reporting, without the wait/);
  assert.match(publicPage, /Dashboards now feel immediate/);
});
