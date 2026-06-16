import { context } from 'esbuild';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2020' };

console.log('👀 Starting watch mode for AXIOS CLI...');

const ctxs = await Promise.all([
  context({
    ...common,
    entryPoints: ['src/main.ts'],
    outfile: 'out/main.js',
    platform: 'node',
    external: ['electron'],
  }),
  context({
    ...common,
    entryPoints: ['src/preload.ts'],
    outfile: 'out/preload.js',
    platform: 'node',
    external: ['electron'],
  }),
  context({
    ...common,
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'out/renderer.js',
    platform: 'browser',
    format: 'iife',
  }),
]);

for (const ctx of ctxs) {
  await ctx.watch();
}

console.log('⚡ Watching for file changes. Press Ctrl+C to exit.');
