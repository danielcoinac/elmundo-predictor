import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('src/App.jsx', 'utf-8');
const m = src.match(/const CSS = `([\s\S]*?)`;/);
if (m) {
  writeFileSync('src/styles.css', m[1]);
  console.log('CSS extracted successfully');
} else {
  console.error('Could not find CSS template literal');
}
