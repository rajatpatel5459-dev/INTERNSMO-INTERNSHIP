export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function resolveAssetUrl(path) {
  return new URL(path, API_URL.replace(/\/api\/?$/, '')).toString();
}

let accessToken = null;
let refreshRequest = null;

export function setApiAccessToken(token) {
  accessToken = token || null;
}

export async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.token) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent('ai-dj:session-expired'));
        }
        throw new Error(result.message || `Session refresh failed (${response.status})`);
      }
      accessToken = result.token;
      window.dispatchEvent(new CustomEvent('ai-dj:session-refreshed', { detail: result }));
      return result.token;
    })().finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

async function sendRequest(path, { token, method, body } = {}) {
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = {
    ...(!isMultipart ? { 'Content-Type': 'application/json' } : {}),
    ...((token || accessToken) ? { Authorization: `Bearer ${token || accessToken}` } : {}),
  };
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(body !== undefined ? { body: isMultipart ? body : JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

export async function apiRequest(path, { token, method = 'GET', body } = {}) {
  let { response, result } = await sendRequest(path, { token, method, body });

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshedToken = await refreshAccessToken();
    ({ response, result } = await sendRequest(path, { token: refreshedToken, method, body }));
  }

  if (!response.ok) {
    throw new Error(result.message || `Request failed (${response.status})`);
  }
  return result;
}

export const api = {
  login: (body) => apiRequest('/auth/login', { method: 'POST', body }),
  register: (body) => apiRequest('/auth/register', { method: 'POST', body }),
  refresh: refreshAccessToken,
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  me: (token) => apiRequest('/auth/me', { token }),
  updateProfile: (token, body) => apiRequest('/auth/me', { token, method: 'PUT', body }),
  tracks: (token) => apiRequest('/tracks', { token }),
  createTrack: (token, body) => apiRequest('/tracks', { token, method: 'POST', body }),
  updateTrack: (token, id, body) => apiRequest(`/tracks/${id}`, { token, method: 'PUT', body }),
  deleteTrack: (token, id) => apiRequest(`/tracks/${id}`, { token, method: 'DELETE' }),
  loungeHistory: (token) => apiRequest('/lounges/my', { token }),
  createLounge: (token, body) => apiRequest('/lounges', { token, method: 'POST', body }),
  joinLounge: (token, inviteCode) => apiRequest('/lounges/join', { token, method: 'POST', body: { inviteCode } }),
  lounge: (token, id) => apiRequest(`/lounges/${id}`, { token }),
  updateLoungeStatus: (token, id, status) => apiRequest(`/lounges/${id}/status`, { token, method: 'PUT', body: { status } }),
  moderateLounge: (token, id, body) => apiRequest(`/lounges/${id}/moderation`, { token, method: 'PUT', body }),
  queue: (token, id) => apiRequest(`/queue/${id}`, { token }),
  addToQueue: (token, id, trackId) => apiRequest(`/queue/${id}/add`, { token, method: 'POST', body: { trackId } }),
  voteForTrack: (token, id, queueEntryId) => apiRequest(`/queue/${id}/vote`, { token, method: 'POST', body: { queueEntryId } }),
  removeFromQueue: (token, id, queueEntryId) => apiRequest(`/queue/${id}/${queueEntryId}`, { token, method: 'DELETE' }),
  advanceQueue: (token, id) => apiRequest(`/queue/${id}/next`, { token, method: 'POST' }),
  sendMessage: (token, id, message) => apiRequest(`/chat/${id}`, { token, method: 'POST', body: { body: message } }),
  messages: (token, id) => apiRequest(`/chat/${id}`, { token }),
  askAiDj: (token, id, question, trackId) => apiRequest(`/aidj/${id}/ask`, { token, method: 'POST', body: { question, trackId } }),
  askTrackQuestion: (token, id, question) => apiRequest(`/aidj/tracks/${id}/ask`, { token, method: 'POST', body: { question } }),
  aiSegue: (token, id) => apiRequest(`/aidj/${id}/segue`, { token, method: 'POST' }),
  applyAiSegue: (token, id, trackId) => apiRequest(`/aidj/${id}/segue/apply`, { token, method: 'POST', body: { trackId } }),
  recommendations: (token, limit = 5) => apiRequest(`/recommendations?limit=${limit}`, { token }),
  tasteProfile: (token) => apiRequest('/recommendations/taste-profile', { token }),
  interactions: (token) => apiRequest('/recommendations/interactions', { token }),
  recordInteraction: (token, body) => apiRequest('/recommendations/interaction', { token, method: 'POST', body }),
  userDashboard: (token) => apiRequest('/analytics/user/dashboard', { token }),
  loungeAnalytics: (token, id) => apiRequest(`/analytics/${id}`, { token }),
  submitBattleTrack: (token, id, trackId) => apiRequest(`/soundclash/${id}/submit`, { token, method: 'POST', body: { trackId } }),
  removeBattleTrack: (token, id, trackId) => apiRequest(`/soundclash/${id}/candidates/${trackId}`, { token, method: 'DELETE' }),
  voteInBattle: (token, id, candidateTrackId) => apiRequest(`/soundclash/${id}/vote`, { token, method: 'POST', body: { candidateTrackId } }),
  soundclash: (token, id) => apiRequest(`/soundclash/${id}`, { token }),
  openBattle: (token, id, durationSeconds = 38) => apiRequest(`/soundclash/${id}/open`, { token, method: 'POST', body: { durationSeconds } }),
  resolveBattle: (token, id) => apiRequest(`/soundclash/${id}/resolve`, { token, method: 'POST' }),
};