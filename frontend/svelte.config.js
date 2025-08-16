import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // optional: only needed if you POST from a different origin
    csrf: { checkOrigin: false }
  }
};

export default config;