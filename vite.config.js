// vite.config.js — ATMOS-VIGIL Svelte 5 + SvelteKit 3 (0% TypeScript anywhere).
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				precompress: false,
				strict: true
			}),
			paths: {
				base: ''
			}
		})
	],
	server: {
		host: '0.0.0.0',
		port: 5173
	},
	preview: {
		host: '0.0.0.0',
		port: 4173,
		allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1', '0.0.0.0']
	},
	build: {
		chunkSizeWarningLimit: 1600
	}
});
