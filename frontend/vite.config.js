import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		host: true,
		strictPort: false
	},
	optimizeDeps: {
		exclude: ['@prisma/client']
	},
	ssr: {
		external: ['@prisma/client']
	}
});
