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
		},
		// Optimize for faster startup
		watch: {
			ignored: ['**/node_modules/**', '**/.svelte-kit/**', '**/prisma/**']
		}
	},
	build: {
		target: 'esnext',
		minify: false,
		rollupOptions: {
			external: ['@vladmandic/human', '@tensorflow/tfjs-node']
		}
	},
	optimizeDeps: {
		exclude: ['@prisma/client', '@vladmandic/human', '@tensorflow/tfjs-node'],
		include: ['svelte'],
		force: false,
		// Don't pre-bundle everything - faster startup
		entries: []
	},
	ssr: {
		external: ['@prisma/client', '@vladmandic/human', '@tensorflow/tfjs-node'],
		noExternal: []
	},
	esbuild: {
		target: 'esnext',
		logOverride: { 'this-is-undefined-in-esm': 'silent' }
	},
	clearScreen: false,
	// Show more info for debugging
	logLevel: 'info'
});
