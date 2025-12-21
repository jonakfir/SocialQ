import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({
		typescript: {
			check: false
		}
	})],
	server: {
		port: 5173,
		host: true,
		strictPort: false,
		hmr: {
			protocol: 'ws',
			host: 'localhost'
		}
	},
	build: {
		target: 'esnext',
		minify: false
	},
	optimizeDeps: {
		exclude: ['@prisma/client'],
		include: ['svelte'],
		force: false
	},
	ssr: {
		external: ['@prisma/client'],
		noExternal: []
	},
	esbuild: {
		target: 'esnext',
		logOverride: { 'this-is-undefined-in-esm': 'silent' }
	},
	clearScreen: false,
	// CRITICAL: Disable all slow operations
	logLevel: 'error'
});
