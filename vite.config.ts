import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const isWindows = process.platform === 'win32';

// adapter-vercel создаёт симлинки, на Windows без Developer Mode/admin это EPERM.
// На Vercel (Linux) адаптер включён всегда; локально на Windows - только если FORCE_ADAPTER=1.
const useAdapter = !isWindows || !!process.env.VERCEL || !!process.env.FORCE_ADAPTER;

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(useAdapter ? { adapter: adapter() } : {})],
	test: { include: ['src/**/*.{test,spec}.ts'], environment: 'node' }
});
