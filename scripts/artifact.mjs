// Turn the single-file build into an Artifact page: the Artifact host adds
// <!doctype>, <html>, <head> and <body> itself, so keep only what goes inside.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist-artifact/artifact.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<link rel="icon"[^>]*>/i, '');
const title = keep.match(/<title>[\s\S]*?<\/title>/)[0];
const rest = keep.replace(title, '');
const out = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${rest.trim()}\n${body.trim()}\n`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/index.html', out);
console.log(`dist-artifact/index.html: ${(out.length / 1024).toFixed(0)} KB`);
