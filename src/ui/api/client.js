export async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

export async function deleteActor(id) {
  const res = await fetch(`/api/actors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete actor: ${await res.text()}`);
  }
}

export async function deleteContent(id) {
  const res = await fetch(`/api/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete content: ${await res.text()}`);
  }
}

export function getActors() {
  return fetchJson('/api/actors');
}

export function getContent() {
  return fetchJson('/api/content');
}

export function getSections() {
  return fetchJson('/api/sections');
}

export function getTakes(contentId) {
  const params = contentId ? `?contentId=${encodeURIComponent(contentId)}` : '';
  return fetchJson(`/api/takes${params}`);
}

export function getJobs() {
  return fetchJson('/api/jobs');
}

export function getVoices() {
  return fetchJson('/api/voices');
}

export async function createActor(payload) {
  const res = await fetch('/api/actors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to create actor: ${await res.text()}`);
  }
  return res.json();
}

export async function createContent(payload) {
  const res = await fetch('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create content: ${await res.text()}`);
  }
  return res.json();
}

export async function createSection(payload) {
  const res = await fetch('/api/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create section: ${await res.text()}`);
  }
  return res.json();
}
