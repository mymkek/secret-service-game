import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
const appVersion = pkg.version + (process.env.VERCEL_GIT_COMMIT_SHA ? '+' + process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : '');

const isWindows = process.platform === 'win32';

// adapter-vercel создаёт симлинки, на Windows без Developer Mode/admin это EPERM.
// На Vercel (Linux) адаптер включён всегда; локально на Windows - только если FORCE_ADAPTER=1.
const useAdapter = !isWindows || !!process.env.VERCEL || !!process.env.FORCE_ADAPTER;

export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(appVersion) },
	plugins: [tailwindcss(), sveltekit(useAdapter ? { adapter: adapter() } : {})],
	test: { include: ['src/**/*.{test,spec}.ts'], environment: 'node' }
});
