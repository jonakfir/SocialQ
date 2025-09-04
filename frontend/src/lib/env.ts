// src/env.ts
import { env as PUBLIC } from '$env/dynamic/public';

// If PUBLIC_API_URL is not set, fall back to your local backend.
// Change the fallback to your real local port (e.g. 5000 for Flask).
const FALLBACK = 'http://127.0.0.1:5000';

export const API = ((PUBLIC?.PUBLIC_API_URL ?? FALLBACK) as string).replace(/\/+$/, '');
