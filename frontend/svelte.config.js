import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csrf: {
      // Allow mobile app (no browser Origin) to POST to /api/collages; hook sets Origin for same-origin check
      checkOrigin: false
    },
    // Disable service worker in dev
    serviceWorker: {
      register: false
    },
    // Skip type generation in dev
    typescript: {
      config: (config) => config
    }
  }
};

export default config;