import { PUBLIC_API_URL } from '$env/static/public';

export const API = (PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');