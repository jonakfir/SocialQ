// FASTEST POSSIBLE CONFIG - bypasses most SvelteKit overhead
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// Disable type checking completely
			typescript: {
				check: false
			}
		})
	],
	server: {
		port: 5173,
		host: true,
		// Don't watch node_modules
		watch: {
			ignored: ['**/node_modules/**', '**/.svelte-kit/**', '**/prisma/**']
		}
	},
	// Skip ALL optimization - fastest startup
	optimizeDeps: {
		disabled: true
	},
	ssr: {
		noExternal: []
	},
	// Minimal logging
	logLevel: 'error',
	clearScreen: false
});
