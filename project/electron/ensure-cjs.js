import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('dist-electron', { recursive: true });
writeFileSync('dist-electron/package.json', '{"type":"commonjs"}\n');
