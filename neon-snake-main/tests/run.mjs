import { execFileSync } from 'node:child_process';
import { build } from 'vite';

// Compile the real TypeScript modules into an isolated Node test bundle.
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: 'tests/.compiled',
    lib: { entry: 'tests/famobi.test.mjs', formats: ['cjs'], fileName: () => 'famobi.test.cjs' },
    rolldownOptions: { external: ['node:test', 'node:assert/strict'] }
  }
});
execFileSync(process.execPath, ['--test', 'tests/.compiled/famobi.test.cjs'], { stdio: 'inherit' });
