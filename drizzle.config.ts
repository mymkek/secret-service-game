import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:local.db';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: url.startsWith('libsql:') || url.startsWith('https:') ? 'turso' : 'sqlite',
	dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN } as { url: string }
});
