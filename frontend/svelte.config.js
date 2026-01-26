import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csrf: { 
      trustedOrigins: ['localhost', '127.0.0.1', '*.vercel.app', '*.localhost']
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