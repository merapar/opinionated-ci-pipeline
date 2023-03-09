import * as fs from 'fs';
import * as esbuild from 'esbuild';

// this script bundles all lambda functions

const entryPoints = fs.readdirSync('src/lambda', {withFileTypes: true})
    .filter(dirent => dirent.isDirectory())
    .map(dirent => `src/lambda/${dirent.name}/index.ts`)
    .filter(file => fs.existsSync(file));

await esbuild.build({
    entryPoints,
    bundle: true,
    platform: 'node',
    packages: 'external',
    outdir: 'lib/lambda',
});
