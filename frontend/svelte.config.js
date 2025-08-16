import adapter from '@sveltejs/adapter-vercel';

const config = {
  kit: {
    adapter: adapter(),
    // (optional if you post from other origins)
    csrf: { checkOrigin: false }
  }
};

export default config;