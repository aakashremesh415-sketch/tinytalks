import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

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
