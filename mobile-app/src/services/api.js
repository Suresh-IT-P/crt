import axios from 'axios';

const API_URL = 'https://cityridestaxi.up.railway.app/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
