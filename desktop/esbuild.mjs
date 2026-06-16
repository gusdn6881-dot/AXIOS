// Axios AI Desktop 빌드 — main(Node) / preload(Node) / renderer(browser) 3개 번들.
// ../src/agents.ts, ../src/plaza.ts 를 복붙 없이 그대로 끌어와 번들한다.
import { build } from 'esbuild';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2020' };

// Node 외부 모듈 — Electron 런타임에서 직접 require 하므로 번들에 포함하면 안 됨
const nodeExternal = ['electron', 'electron-updater', 'child_process', 'original-fs'];

await Promise.all([
  // 메인 프로세스 (Node)
  build({
    ...common,
    entryPoints: ['src/main.ts'],
    outfile: 'out/main.js',
    platform: 'node',
    format: 'cjs',
    external: nodeExternal,
  }),
  // 프리로드 (Node + contextBridge)
  build({
    ...common,
    entryPoints: ['src/preload.ts'],
    outfile: 'out/preload.js',
    platform: 'node',
    format: 'cjs',
    external: nodeExternal,
  }),
  // 렌더러 (브라우저)
  build({
    ...common,
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'out/renderer.js',
    platform: 'browser',
    format: 'iife',
  }),
]);

console.log('✅ Axios AI Desktop 번들 완료');
