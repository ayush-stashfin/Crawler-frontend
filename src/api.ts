import { readableError } from './format';
import type { AuthSession, AuthUser, Competitor, GenerateStatus, MatrixPost, Post, RegenerationRequest, Run, ScriptReview, ScriptSummary, TeardownSummary } from './types';

// Empty in dev/preview (Vite forwards /api to the backend). Set VITE_API_BASE when the
// built app is hosted apart from the API, e.g. https://reel-radar-api.internal.
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

/** Called when the API says the session is gone (expired or signed out elsewhere). */
let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: (() => void) | null) => {
  onSignedOut = fn;
};

/** What to say when the API gives no message of its own, by status code. */
function statusMessage(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'We couldn’t find that. It may have been removed.';
  if (status === 429) return 'Too many requests at once. Please wait a moment and try again.';
  if (status >= 500) return 'The server had a problem. Please try again in a moment.';
  return 'That didn’t work. Please check the details and try again.';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include', // the session cookie, also when the API is on another origin
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error('We can’t reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) onSignedOut?.();
  if (!res.ok) {
    let detail = statusMessage(res.status);
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = readableError(body.detail);
    } catch {
      // not JSON; keep the message for the status code
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('The server sent back an answer we couldn’t read. Please try again.');
  }
}

export const api = {
  session: () => request<AuthSession>('/api/auth/session'),
  signIn: (credential: string, remember: boolean) => request<AuthUser>('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential, remember }) }),
  signOut: () => request<void>('/api/auth/logout', { method: 'POST' }),
  days: () => request<string[]>('/api/days'),
  posts: (day?: string) => request<{ date: string | null; items: Post[] }>(`/api/posts${day ? `?day=${day}` : ''}`),
  matrix: (start: string, end: string, day?: string) =>
    request<{ date: string | null; items: MatrixPost[] }>(`/api/matrix?start=${start}&end=${end}${day ? `&day=${day}` : ''}`),
  competitors: (day?: string) => request<Competitor[]>(`/api/competitors${day ? `?day=${day}` : ''}`),
  runs: () => request<Run[]>('/api/runs'),
  /** Saved for review; nothing is scraped until the team approves it. `message` is shown to the user. */
  requestCompetitor: (name: string, ig_handle: string) =>
    request<{ status: string; message: string }>('/api/competitor-requests', { method: 'POST', body: JSON.stringify({ name, ig_handle }) }),
  setActive: (id: number, active: boolean) => request<Competitor>(`/api/competitors/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  generate: (postId: number) => request<GenerateStatus>(`/api/posts/${postId}/generate`, { method: 'POST' }),
  generateStatus: (postId: number) => request<GenerateStatus>(`/api/posts/${postId}/generate`),
  scripts: () => request<ScriptSummary[]>('/api/scripts'),
  /** Reels with a teardown and no script yet. */
  teardowns: () => request<TeardownSummary[]>('/api/teardowns'),
  script: (postId: number) => request<ScriptReview>(`/api/scripts/${postId}`),
  review: (postId: number, action: 'approve' | 'reject', note = '') =>
    request<{ status: string }>(`/api/scripts/${postId}/review`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  /** Approved by someone else: nothing is written yet, a request goes to the approver (approval_needed). */
  regenerate: (postId: number, note: string) =>
    request<{ regenerating: boolean; approval_needed: boolean; request?: RegenerationRequest }>(`/api/scripts/${postId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  regenerationRequests: () => request<RegenerationRequest[]>('/api/regeneration-requests?status=pending'),
  decideRegeneration: (id: number, action: 'approve' | 'reject', note = '') =>
    request<RegenerationRequest & { regenerating: boolean }>(`/api/regeneration-requests/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    }),
};

/** Image paths from the API are relative to it. */
export const mediaUrl = (path: string | null) => (path ? `${BASE}${path}` : null);
