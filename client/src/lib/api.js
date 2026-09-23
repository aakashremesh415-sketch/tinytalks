import axios from 'axios';
import { getOrCreateDeviceId } from './crypto.js';

export const api = axios.create({ baseURL: '/api' });

// Identifies which of this account's devices is calling (see
// server/src/middleware/auth.js). Set once, on every request, same as the
// auth token below.
api.defaults.headers.common['X-Device-Id'] = getOrCreateDeviceId();

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem('tt_token', token);
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem('tt_token');
  }
}

export function getStoredToken() {
  return localStorage.getItem('tt_token');
}

// Every page does `setError(e.response?.data?.error || 'fallback')` and
// then renders that directly as a React child. That's normally a plain
// string from our own Express error handlers — but a crashed serverless
// function, a proxy timeout page, or any other non-JSON/non-shaped error
// response can hand back something else entirely (an object, HTML, Vercel's
// own {code, message} crash body). Rendering a non-string there crashes
// the whole React tree (a blank page) instead of showing an error message,
// so every call site should route through this instead of the raw field.
export function getErrorMessage(e, fallback = 'Something went wrong.') {
  const data = e?.response?.data?.error;
  return typeof data === 'string' && data ? data : fallback;
}
