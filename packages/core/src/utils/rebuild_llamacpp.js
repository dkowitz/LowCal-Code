#!/usr/bin/env node
/**
 * Temporary script to reconstruct llamaCppProcessManager.ts from the
 * compiled .d.ts types and the dist .js (minus verbose logs).
 */
const fs = require('fs');
const path = require('path');

const baseDir = '/home/atmandk/LowCal-dev/packages/core';
const distJs = fs.readFileSync(path.join(baseDir, 'dist/src/utils/llamaCppProcessManager.js'), 'utf8');
const distDts = fs.readFileSync(path.join(baseDir, 'dist/src/utils/llamaCppProcessManager.d.ts'), 'utf8');

// Lines to suppress - verbose debug logging
const SUPPRESSED = [
  /\[llama\.cpp\] Checking bundled binary/,
  /\[llama\.cpp\] Using bundled binary/,
  /\[llama\.cpp\] Binary path/,
  /\[llama\.cpp\] Spawning/,
  /\[llama\.cpp\] Spawn error/,
  /\[llama\.cpp\] Process error event/,
  /\[llama\.cpp\] Killed stale/,
  /console\.debug\(\`/ // stdio debug pipe
];

const lines = distJs.split('\n');
const out = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (SUPPRESSED.some(pat => pat.test(trimmed))) continue;
  if (/^\/\/# source/.test(trimmed)) continue;
  out.push(line);
}
// remove double blanks
const final = [];
for (const line of out) {
  if (line.trim() === '' && final.length && final[final.length - 1].trim() === '') continue;
  final.push(line);
}

fs.writeFileSync(
  path.join(baseDir, 'src/utils/llamaCppProcessManager.ts'),
  final.join('\n'),
  'utf8'
);
console.log(`Wrote ${final.length} lines (from dist JS, verbose logs removed)`);
