import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csrf: { 
      trustedOrigins: ['localhost', '127.0.0.1', '*.vercel.app', '*.localhost']
    },
    // Optimize for faster dev startup
    typescript: {
      config: (config) => config
    }
  }
};

export default config;