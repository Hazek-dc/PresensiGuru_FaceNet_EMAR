import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Alias '@' sama dengan laravel-vite-plugin, agar halaman yang memakai '@/...' bisa diuji.
    resolve: {
        alias: { '@': fileURLToPath(new URL('./resources/js', import.meta.url)) },
    },
    test: {
        environment: 'jsdom',
        include: ['resources/js/**/*.test.{js,jsx,ts,tsx}'],
    },
});
