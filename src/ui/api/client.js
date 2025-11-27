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

export async function getVoices() {
  const res = await fetch('/api/voices');
  if (!res.ok) {
    throw new Error(`Failed to get voices: ${await res.text()}`);
  }
  return res.json();
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

export async function updateActor(id, payload) {
  const res = await fetch(`/api/actors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update actor: ${await res.text()}`);
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

export async function getGlobalDefaults() {
  const res = await fetch('/api/defaults');
  if (!res.ok) {
    throw new Error(`Failed to get global defaults: ${await res.text()}`);
  }
  return res.json();
}

export async function updateGlobalDefaults(contentType, settings) {
  const res = await fetch(`/api/defaults/${encodeURIComponent(contentType)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error(`Failed to update global defaults: ${await res.text()}`);
  }
  return res.json();
}

export async function previewVoice(voiceId, text, stability, similarityBoost) {
  const res = await fetch('/api/voices/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text,
      stability: stability,
      similarity_boost: similarityBoost
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to preview voice: ${await res.text()}`);
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

export async function updateSection(id, payload) {
  const res = await fetch(`/api/sections/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update section: ${await res.text()}`);
  }
  return res.json();
}

export async function deleteSection(id) {
  const res = await fetch(`/api/sections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete section: ${await res.text()}`);
  }
}

export async function updateContent(id, payload) {
  const res = await fetch(`/api/content/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update content: ${await res.text()}`);
  }
  return res.json();
}

export async function updateTake(id, payload) {
  const res = await fetch(`/api/takes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update take: ${await res.text()}`);
  }
  return res.json();
}
