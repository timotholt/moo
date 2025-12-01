// Type declarations for client.js API functions

export function fetchJson(path: string): Promise<unknown>;
export function getProviderCredits(): Promise<{ credits: number }>;
export function deleteActor(id: string): Promise<void>;
export function deleteContent(id: string): Promise<void>;
export function getActors(): Promise<{ actors: unknown[] }>;
export function getContent(): Promise<{ content: unknown[] }>;
export function getSections(): Promise<{ sections: unknown[] }>;
export function getTakes(contentId?: string): Promise<{ takes: unknown[] }>;
export function deleteTake(id: string): Promise<void>;
export function generateTakes(contentId: string, count?: number): Promise<{ takes: unknown[] }>;
export function getJobs(): Promise<{ jobs: unknown[] }>;
export function getVoices(): Promise<{ voices: unknown[] }>;
export function createActor(payload?: Record<string, unknown>): Promise<{ actor: unknown }>;
export function updateActor(id: string, payload: Record<string, unknown>): Promise<{ actor: unknown }>;
export function createContent(payload: Record<string, unknown>): Promise<{ content: unknown | unknown[]; message?: string }>;
export function getGlobalDefaults(): Promise<Record<string, unknown>>;
export function updateGlobalDefaults(contentType: string, settings: Record<string, unknown>): Promise<Record<string, unknown>>;
export function updateContent(id: string, payload: Record<string, unknown>): Promise<{ content: unknown }>;
export function createSection(payload: Record<string, unknown>): Promise<{ section: unknown }>;
export function updateSection(id: string, payload: Record<string, unknown>): Promise<{ section: unknown }>;
export function deleteSection(id: string): Promise<void>;
export function updateTake(id: string, payload: Record<string, unknown>): Promise<{ take: unknown }>;
