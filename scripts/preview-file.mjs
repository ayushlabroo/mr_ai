// A static review build that needs neither a listening server nor native access.
import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

await build({
  mode: 'visual-review',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: '.preview',
    emptyOutDir: true,
    lib: {
      entry: 'src/main.tsx',
      name: 'MrAIPreview',
      formats: ['iife'],
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
  },
});
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'self' file:; script-src 'self' file:; style-src 'self' file: 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; frame-src 'none'"><title>MrAI by Ayush — Local preview</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script defer src="app.js"></script></body></html>`;
await writeFile('.preview/index.html', html);
await writeFile('.preview/styleguide.html', html);
await writeFile('.preview/download.html', html);
const frames = [390, 768, 1440]
  .map(
    (width) =>
      `<section><h2>${width}px viewport</h2><iframe title="MrAI by Ayush at ${width}px" src="index.html" width="${width}" height="1000"></iframe></section>`,
  )
  .join('');
await writeFile(
  '.preview/review.html',
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>MrAI by Ayush — Responsive review</title><style>body{margin:0;padding:26px;font:14px -apple-system,sans-serif;background:#d9e0e8;color:#25364a}h1{font-size:24px}h2{font-size:14px;margin:24px 0 12px}section{margin-bottom:30px}iframe{border:1px solid #ffffff99;border-radius:16px;display:block;box-shadow:0 6px 30px #25364a12}</style></head><body><h1>MrAI by Ayush · Responsive visual review</h1><p>Each embedded workspace has an exact CSS viewport width. This review page is not part of the production app.</p>${frames}</body></html>`,
);
console.log(`Static visual review: ${path.resolve('.preview/index.html')}`);
await writeFile(
  '.preview/review-accounts.html',
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>MrAI account settings review</title><style>body{margin:0;padding:24px;font:14px -apple-system,sans-serif;background:#d9e0e8;color:#25364a}section{margin-bottom:24px}iframe{border:1px solid #ffffff99;border-radius:16px;display:block}</style></head><body>${[390, 768, 1440].map((width) => `<section><h2>${width}px account settings</h2><iframe title="Account settings at ${width}px" src="index.html?settings=1" width="${width}" height="1000"></iframe></section>`).join('')}</body></html>`,
);
const downloadFrames = [390, 768, 1440]
  .map(
    (width) =>
      `<section><h2>${width}px download page</h2><iframe title="Downloads at ${width}px" src="index.html?view=download" width="${width}" height="1300"></iframe></section>`,
  )
  .join('');
await writeFile(
  '.preview/review-downloads.html',
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>MrAI downloads review</title><style>body{margin:0;padding:24px;font:14px -apple-system,sans-serif;background:#d9e0e8;color:#25364a}section{margin-bottom:24px}iframe{border:1px solid #ffffff99;border-radius:16px;display:block}</style></head><body>${downloadFrames}</body></html>`,
);
