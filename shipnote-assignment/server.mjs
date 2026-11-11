import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || join(root, 'data', 'shipnote.json');
const publicDir = join(root, 'public');

const categories = ['Added', 'Improved', 'Fixed'];
const releaseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  version: z.string().trim().min(1).max(40),
  category: z.enum(categories),
  summary: z.string().trim().min(10).max(300),
  body: z.string().trim().min(30).max(5000),
  publish: z.boolean().optional().default(false)
});

let writeQueue = Promise.resolve();

function seedData() {
  const now = new Date().toISOString();
  return {
    releases: [{
      id: 'welcome-to-shipnote', slug: 'welcome-to-shipnote', title: 'A clearer way to share progress',
      version: 'v1.0', category: 'Added',
      summary: 'Shipnote turns a thoughtful Claude draft into a live update your customers can trust.',
      body: 'Your release notes deserve more than a chat window.\n\nAsk Claude to draft an update, then review, edit and publish it here. The result stays live at a stable link for every customer who needs the context.',
      status: 'published', createdAt: now, updatedAt: now, publishedAt: now
    }]
  };
}

async function loadData() {
  try {
    const raw = await readFile(dataFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.releases) ? data : seedData();
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read store:', error);
    const data = seedData();
    await persist(data);
    return data;
  }
}

async function persist(data) {
  await mkdir(dirname(dataFile), { recursive: true });
  const temp = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2));
  await rename(temp, dataFile);
}

function withWrite(fn) {
  const operation = writeQueue.then(fn, fn);
  writeQueue = operation.catch(() => {});
  return operation;
}

function cleanSlug(value) {
  const stem = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
  return stem || 'release';
}

function uniqueSlug(releases, title, excludedId) {
  const base = cleanSlug(title);
  let slug = base;
  let number = 2;
  while (releases.some((release) => release.slug === slug && release.id !== excludedId)) {
    slug = `${base}-${number++}`;
  }
  return slug;
}

function publicUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
  return `${proto}://${host}`;
}

async function listReleases() {
  const data = await loadData();
  return [...data.releases].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function findRelease(id) {
  const releases = await listReleases();
  return releases.find((release) => release.id === id || release.slug === id);
}

async function createRelease(input) {
  return withWrite(async () => {
    const data = await loadData();
    const now = new Date().toISOString();
    const release = {
      id: randomUUID(), slug: uniqueSlug(data.releases, input.title), title: input.title,
      version: input.version, category: input.category, summary: input.summary, body: input.body,
      status: input.publish ? 'published' : 'draft', createdAt: now, updatedAt: now,
      ...(input.publish ? { publishedAt: now } : {})
    };
    data.releases.push(release);
    await persist(data);
    return release;
  });
}

async function updateRelease(id, changes) {
  return withWrite(async () => {
    const data = await loadData();
    const release = data.releases.find((item) => item.id === id || item.slug === id);
    if (!release) return null;
    Object.assign(release, changes, { updatedAt: new Date().toISOString() });
    if (changes.title) release.slug = uniqueSlug(data.releases, changes.title, release.id);
    await persist(data);
    return release;
  });
}

function result(release, base) {
  return {
    id: release.id, title: release.title, status: release.status,
    editorUrl: `${base}/?release=${encodeURIComponent(release.id)}`,
    publicUrl: `${base}/r/${encodeURIComponent(release.slug)}`
  };
}

function text(content) { return { content: [{ type: 'text', text: content }] }; }

function createMcpServer(req) {
  const base = publicUrl(req);
  const server = new McpServer({ name: 'Shipnote', version: '1.0.0' }, {
    instructions: 'Shipnote stores customer-facing product updates. Draft first unless the user clearly asks to publish. Never claim a release is live unless the tool response says it is published.'
  });

  server.registerTool('create_release', {
    title: 'Create a Shipnote release',
    description: 'Create a customer-facing release note in Shipnote. Write concise, specific copy from the user’s source material. This saves a real editable draft; set publish only after explicit user approval.',
    inputSchema: {
      title: z.string().min(3).max(120).describe('A clear customer-facing headline.'),
      version: z.string().min(1).max(40).describe('A short release label such as v2.4 or October 2026.'),
      category: z.enum(categories).describe('The primary kind of update.'),
      summary: z.string().min(10).max(300).describe('One concise sentence explaining customer value.'),
      body: z.string().min(30).max(5000).describe('The release note body in plain text with short paragraphs.'),
      publish: z.boolean().optional().describe('Only true when the user explicitly asks to publish it.')
    }
  }, async (input) => {
    const parsed = releaseSchema.parse(input);
    const release = await createRelease(parsed);
    const links = result(release, base);
    return text(`Created ${release.status} release “${release.title}”.\nEdit it: ${links.editorUrl}\n${release.status === 'published' ? `Live page: ${links.publicUrl}` : `When reviewed, publish it with publish_release using release_id ${release.id}.`}`);
  });

  server.registerTool('update_release', {
    title: 'Update a Shipnote release',
    description: 'Edit an existing Shipnote release. Use list_releases or get_release first if you need its ID. Provide only fields that should change.',
    inputSchema: {
      release_id: z.string().describe('The ID or slug of the release to edit.'),
      title: z.string().min(3).max(120).optional(), version: z.string().min(1).max(40).optional(),
      category: z.enum(categories).optional(), summary: z.string().min(10).max(300).optional(),
      body: z.string().min(30).max(5000).optional()
    }
  }, async ({ release_id, ...changes }) => {
    const release = await updateRelease(release_id, changes);
    if (!release) return text(`No release found with ID or slug “${release_id}”.`);
    const links = result(release, base);
    return text(`Updated “${release.title}”.\nEdit it: ${links.editorUrl}`);
  });

  server.registerTool('publish_release', {
    title: 'Publish a Shipnote release',
    description: 'Make an already reviewed Shipnote release public at its permanent URL. Only use when the user explicitly asks to publish.',
    inputSchema: { release_id: z.string().describe('The ID or slug of the release to publish.') }
  }, async ({ release_id }) => {
    const existing = await findRelease(release_id);
    if (!existing) return text(`No release found with ID or slug “${release_id}”.`);
    const release = await updateRelease(existing.id, { status: 'published', publishedAt: new Date().toISOString() });
    const links = result(release, base);
    return text(`Published “${release.title}”. Live page: ${links.publicUrl}\nYou can still edit it here: ${links.editorUrl}`);
  });

  server.registerTool('list_releases', {
    title: 'List Shipnote releases', description: 'List recent Shipnote releases and their IDs, status and edit links.', inputSchema: {}
  }, async () => {
    const releases = await listReleases();
    return text(releases.map((release) => {
      const links = result(release, base);
      return `${release.status.toUpperCase()} · ${release.title}\nID: ${release.id}\nEdit: ${links.editorUrl}${release.status === 'published' ? `\nLive: ${links.publicUrl}` : ''}`;
    }).join('\n\n'));
  });

  server.registerTool('get_release', {
    title: 'Get a Shipnote release', description: 'Fetch the complete text and status of one Shipnote release before editing or publishing it.',
    inputSchema: { release_id: z.string().describe('The ID or slug of the release.') }
  }, async ({ release_id }) => {
    const release = await findRelease(release_id);
    if (!release) return text(`No release found with ID or slug “${release_id}”.`);
    return text(JSON.stringify(release, null, 2));
  });
  return server;
}

const indexHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shipnote — release notes people read</title><link rel="stylesheet" href="/styles.css"></head><body><div class="mesh one"></div><div class="mesh two"></div><main><nav><a class="brand" href="/"><span>✦</span> shipnote</a><a href="/connect" class="nav-link">Connect Claude <b>↗</b></a></nav><section class="hero"><div><p class="eyebrow">YOUR PRODUCT UPDATES, KEPT LIVE</p><h1>Release notes that<br><em>earn attention.</em></h1><p class="lede">Claude writes the first draft. You decide what ships. Shipnote keeps every update clear, editable, and live for your customers.</p></div><div class="hero-card"><span class="dot"></span><p>Built for the human moment<br>after the AI draft.</p><small>No AI keys. No in-app generation.<br>Just a lasting place for the work.</small></div></section><section class="workspace"><aside><div class="side-top"><span class="eyebrow">WORKSPACE</span><h2>Release desk</h2></div><button id="new-release" class="new-button">+ New release</button><div id="release-list" class="release-list" aria-live="polite"></div></aside><article class="editor"><div id="empty-state" class="empty-state"><span>✦</span><h2>Select a release</h2><p>Or ask Claude to create one through Shipnote’s MCP connection.</p><a href="/connect">See connection steps →</a></div><form id="release-form" hidden><div class="form-header"><div><p id="form-status" class="status"></p><input id="title" name="title" aria-label="Release title" placeholder="Release title" required maxlength="120"></div><div class="form-actions"><button type="button" id="preview" class="quiet">Preview</button><button type="submit" class="save">Save changes</button></div></div><div class="metadata"><label>Version<input id="version" name="version" required maxlength="40"></label><label>Type<select id="category" name="category"><option>Added</option><option>Improved</option><option>Fixed</option></select></label><label>Visibility<select id="status" name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label></div><label class="wide">Customer takeaway<textarea id="summary" name="summary" required minlength="10" maxlength="300" rows="2"></textarea></label><label class="wide">Release details<textarea id="body" name="body" required minlength="30" maxlength="5000" rows="12"></textarea><span>Plain text is intentional: customers get the message, not a document editor.</span></label><p id="save-message" class="save-message" role="status"></p></form></article></section></main><script src="/app.js"></script></body></html>`;

const connectHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Claude — Shipnote</title><link rel="stylesheet" href="/styles.css"></head><body><main><nav><a class="brand" href="/"><span>✦</span> shipnote</a><a href="/" class="nav-link">Open workspace <b>↗</b></a></nav><section class="connect"><p class="eyebrow">CLAUDE + SHIPNOTE</p><h1>Connect the drafting<br><em>to the durable work.</em></h1><ol><li>In Claude, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>.</li><li>Paste this MCP server URL:<div class="code"><code id="mcp-url"></code><button id="copy">Copy</button></div></li><li>Return to a chat and ask: <blockquote>“Create a Shipnote release for version 2.4. It adds SSO and fixes a slow dashboard. Make it a draft.”</blockquote></li><li>Open Shipnote to edit the draft, then publish it when it is right.</li></ol><div class="note"><b>How it works</b><br>Claude supplies the reasoning and writing through your own Claude account. Shipnote only stores, edits, publishes, and serves release notes. It has no AI provider key or model call.</div></section></main><script>const url=location.origin+'/mcp';document.querySelector('#mcp-url').textContent=url;document.querySelector('#copy').onclick=async()=>{await navigator.clipboard.writeText(url);document.querySelector('#copy').textContent='Copied';setTimeout(()=>document.querySelector('#copy').textContent='Copy',1500)};</script></body></html>`;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function serveAsset(req, res, pathname) {
  const relative = normalize(pathname.replace(/^\/+/, '')).replace(/^\.\.(\/|\\|$)/, '');
  const filename = join(publicDir, relative);
  if (!filename.startsWith(publicDir)) return false;
  try {
    const body = await readFile(filename);
    const type = extname(filename) === '.css' ? 'text/css' : extname(filename) === '.js' ? 'application/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=300' });
    res.end(body);
    return true;
  } catch { return false; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (url.pathname === '/mcp') {
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end('Method Not Allowed'); }
      const mcp = createMcpServer(req);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
      res.on('close', () => { transport.close().catch(() => {}); mcp.close().catch(() => {}); });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(indexHtml);
    }
    if (req.method === 'GET' && url.pathname === '/connect') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(connectHtml);
    }
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname.startsWith('/r/')) {
      const release = await findRelease(decodeURIComponent(url.pathname.slice(3)));
      if (!release || release.status !== 'published') { res.writeHead(404); return res.end('Release not found'); }
      const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(release.title)} — Shipnote</title><link rel="stylesheet" href="/styles.css"></head><body class="public-page"><main><nav><a class="brand" href="/"><span>✦</span> shipnote</a><span class="nav-link">Product updates</span></nav><article class="public-release"><p class="eyebrow">${safe(release.category)} · ${safe(release.version)}</p><h1>${safe(release.title)}</h1><p class="public-summary">${safe(release.summary)}</p><div class="public-body">${safe(release.body).split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('')}</div><footer>Published ${new Date(release.publishedAt || release.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Powered by Shipnote</footer></article></main></body></html>`);
    }
    if (url.pathname === '/api/releases' && req.method === 'GET') return sendJson(res, 200, await listReleases());
    if (url.pathname === '/api/releases' && req.method === 'POST') {
      const input = releaseSchema.parse(await readJson(req));
      return sendJson(res, 201, await createRelease(input));
    }
    const apiMatch = url.pathname.match(/^\/api\/releases\/([^/]+)$/);
    if (apiMatch && req.method === 'GET') {
      const release = await findRelease(decodeURIComponent(apiMatch[1]));
      return release ? sendJson(res, 200, release) : sendJson(res, 404, { error: 'Release not found.' });
    }
    if (apiMatch && req.method === 'PUT') {
      const changes = z.object({ title: z.string().min(3).max(120), version: z.string().min(1).max(40), category: z.enum(categories), summary: z.string().min(10).max(300), body: z.string().min(30).max(5000), status: z.enum(['draft', 'published']) }).parse(await readJson(req));
      if (changes.status === 'published') changes.publishedAt = new Date().toISOString();
      const release = await updateRelease(decodeURIComponent(apiMatch[1]), changes);
      return release ? sendJson(res, 200, release) : sendJson(res, 404, { error: 'Release not found.' });
    }
    if (req.method === 'GET' && (url.pathname === '/styles.css' || url.pathname === '/app.js')) {
      if (await serveAsset(req, res, url.pathname)) return;
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    if (res.headersSent) return;
    console.error(error);
    const isValidation = error instanceof z.ZodError;
    sendJson(res, isValidation ? 400 : 500, { error: isValidation ? error.issues[0]?.message : 'Something went wrong.' });
  }
});

server.listen(port, () => console.log(`Shipnote is running at http://localhost:${port}`));
