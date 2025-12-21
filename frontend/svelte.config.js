import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csrf: { 
      checkOrigin: false,
      trustedOrigins: ['localhost', '127.0.0.1']
    }
  }
};

export default config;