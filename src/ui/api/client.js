export async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

export function getProviderCredits() {
  return fetchJson('/api/provider/credits');
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

export async function deleteTake(id) {
  const res = await fetch(`/api/takes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete take: ${await res.text()}`);
  }
}

export async function generateTakes(contentId, count = 1) {
  const res = await fetch(`/api/content/${encodeURIComponent(contentId)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to generate takes: ${res.status}`);
  }
  return res.json();
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

export async function previewVoice(voiceId, text, stability, similarityBoost, modelId) {
  const res = await fetch('/api/voices/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text,
      stability: stability,
      similarity_boost: similarityBoost,
      model_id: modelId
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

// Project management
export async function getProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) {
    throw new Error(`Failed to get projects: ${await res.text()}`);
  }
  return res.json();
}

export async function createProject(name) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create project: ${await res.text()}`);
  }
  return res.json();
}

export async function deleteProject(name) {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete project: ${await res.text()}`);
  }
  return res.json();
}

export async function copyProject(name, newName) {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) {
    throw new Error(`Failed to copy project: ${await res.text()}`);
  }
  return res.json();
}

export async function getCurrentProject() {
  const res = await fetch('/api/projects/current');
  if (!res.ok) {
    throw new Error(`Failed to get current project: ${await res.text()}`);
  }
  return res.json();
}

export async function switchProject(name) {
  const res = await fetch('/api/projects/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to switch project: ${await res.text()}`);
  }
  return res.json();
}
