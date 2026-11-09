import { build } from 'vite';
import { copyFile } from 'node:fs/promises';

await build();
await copyFile(new URL('../dist/index.html', import.meta.url), new URL('../Side Effect.html', import.meta.url));
console.log('Ready: Side Effect.html (offline, single file)');
