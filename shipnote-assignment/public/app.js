let releases = [];
let activeId = null;

const $ = (selector) => document.querySelector(selector);
const form = $('#release-form');
const fields = ['title', 'version', 'category', 'summary', 'body', 'status'];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderList() {
  $('#release-list').innerHTML = releases.map((release) => `<button class="release-card ${release.id === activeId ? 'active' : ''}" data-id="${release.id}"><span class="badge ${release.status}">${release.status}</span><div class="card-meta">${escapeHtml(release.category)} · ${escapeHtml(release.version)}</div><div class="card-title">${escapeHtml(release.title)}</div></button>`).join('');
  document.querySelectorAll('.release-card').forEach((button) => button.onclick = () => openRelease(button.dataset.id));
}

function showForm(show) {
  form.hidden = !show;
  $('#empty-state').hidden = show;
}

function openRelease(id) {
  const release = releases.find((item) => item.id === id);
  if (!release) return;
  activeId = id;
  fields.forEach((field) => { $(`#${field}`).value = release[field] || ''; });
  $('#form-status').textContent = release.status;
  $('#form-status').className = `status ${release.status}`;
  $('#save-message').textContent = '';
  showForm(true);
  renderList();
  history.replaceState(null, '', `?release=${encodeURIComponent(id)}`);
}

async function loadReleases(selectFromUrl = true) {
  releases = await fetch('/api/releases').then((response) => response.json());
  renderList();
  const target = new URLSearchParams(location.search).get('release');
  if (selectFromUrl && target && releases.some((release) => release.id === target)) openRelease(target);
}

$('#new-release').onclick = async () => {
  const now = new Date();
  const release = await fetch('/api/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Untitled release', version: `v${now.getFullYear()}.${now.getMonth() + 1}`, category: 'Added', summary: 'A short, customer-focused description of what has changed.', body: 'Start with what customers can do now.\n\nThen add the details people need in order to use the update well.', publish: false }) }).then((response) => response.json());
  await loadReleases(false); openRelease(release.id); $('#title').focus(); $('#title').select();
};

form.onsubmit = async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  const message = $('#save-message');
  message.textContent = 'Saving…';
  const response = await fetch(`/api/releases/${encodeURIComponent(activeId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) { message.textContent = data.error || 'Could not save this release.'; return; }
  await loadReleases(false); openRelease(data.id); message.textContent = 'Saved. Your edits are now live in Shipnote.';
};

$('#preview').onclick = () => {
  const release = releases.find((item) => item.id === activeId);
  if (!release) return;
  if (release.status !== 'published') { $('#save-message').textContent = 'Set visibility to Published and save before opening the public page.'; return; }
  window.open(`/r/${encodeURIComponent(release.slug)}`, '_blank', 'noopener');
};

loadReleases().catch(() => { $('#release-list').innerHTML = '<p class="save-message">Could not load releases. Refresh and try again.</p>'; });
