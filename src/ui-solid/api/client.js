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
  console.log(`[API] Deleting actor: ${id}`);
  const res = await fetch(`/api/actors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete actor: ${await res.text()}`);
  }
  console.log(`[API] Actor deleted`);
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

export function getScenes() {
  return fetchJson('/api/scenes');
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
  console.log(`[API] Generating ${count} take(s) for content ${contentId}...`);
  const res = await fetch(`/api/content/${encodeURIComponent(contentId)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error(`[API] Generate failed:`, data.error || res.status);
    throw new Error(data.error || `Failed to generate takes: ${res.status}`);
  }
  const result = await res.json();
  console.log(`[API] Generated ${result.takes?.length || 0} take(s)`);
  return result;
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
  console.log(`[API] Creating actor:`, payload?.display_name || 'unnamed');
  const res = await fetch('/api/actors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to create actor: ${await res.text()}`);
  }
  const result = await res.json();
  console.log(`[API] Actor created: ${result.actor?.display_name}`);
  return result;
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

// Batch operations

/**
 * Preview what backfill would generate without actually generating
 * @param {Object} options - Filter options
 * @param {string} [options.actorId] - Limit to specific actor
 * @param {string} [options.sectionId] - Limit to specific section
 * @param {string} [options.contentId] - Limit to specific cue
 */
export async function previewBackfillTakes(options = {}) {
  const params = new URLSearchParams();
  if (options.actorId) params.set('actor_id', options.actorId);
  if (options.sectionId) params.set('section_id', options.sectionId);
  if (options.contentId) params.set('content_id', options.contentId);
  
  const url = `/api/batch/backfill-takes/preview${params.toString() ? '?' + params : ''}`;
  console.log(`[API] Preview backfill: ${url}`);
  return fetchJson(url);
}

/**
 * Backfill takes to meet minimum candidates for incomplete cues
 * @param {Object} options - Filter options
 * @param {string} [options.actorId] - Limit to specific actor
 * @param {string} [options.sectionId] - Limit to specific section
 * @param {string} [options.contentId] - Limit to specific cue
 */
export async function backfillTakes(options = {}) {
  const params = new URLSearchParams();
  if (options.actorId) params.set('actor_id', options.actorId);
  if (options.sectionId) params.set('section_id', options.sectionId);
  if (options.contentId) params.set('content_id', options.contentId);
  
  const url = `/api/batch/backfill-takes${params.toString() ? '?' + params : ''}`;
  console.log(`[API] Backfill takes: ${url}`);
  
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Failed to backfill takes: ${res.status}`);
  }
  return res.json();
}
