#!/usr/bin/env node
/**
 * LowCal re-branding helper.
 *
 * Reads QWEN_REBRAND_FINAL.json and performs the curated text replacements
 * across the repository. The manifest may include context snippets that are
 * slightly abbreviated (ellipsis, smart quotes, non-breaking hyphens, etc.),
 * so this script performs fuzzy matching to ensure every listed occurrence is
 * updated exactly once.
 *
 * Usage (from repo root):
 *   npm run rebrand            # apply the changes
 *   npm run rebrand --dry-run  # preview without writing files
 */

import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const JSON_PATH = resolve('QWEN_REBRAND_FINAL.json');
const DASH_CHAR_REGEX = /[\u2010-\u2015\u2212\uFE63\uFF0D]/g; // various dash/hyphen forms
const HYPHEN_CLASS = '[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212\\uFE63\\uFF0D]';
const DOUBLE_QUOTE_PATTERN = '[\\"“”]';
const SINGLE_QUOTE_PATTERN = "[\\'’`]";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(inputPath) {
  return resolve(String(inputPath).replace(DASH_CHAR_REGEX, '-'));
}

function diffStrings(original, replacement) {
  let prefix = 0;
  while (
    prefix < original.length &&
    prefix < replacement.length &&
    original[prefix] === replacement[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < original.length - prefix &&
    suffix < replacement.length - prefix &&
    original[original.length - 1 - suffix] === replacement[replacement.length - 1 - suffix]
  ) {
    suffix++;
  }

  return {
    target: original.slice(prefix, original.length - suffix),
    substitution: replacement.slice(prefix, replacement.length - suffix),
    prefix: original.slice(0, prefix),
    suffix: original.slice(original.length - suffix),
  };
}

function buildPattern(input, { ellipsisIsWildcard = true } = {}) {
  let pattern = '';
  const length = input.length;

  for (let i = 0; i < length; ) {
    const codePoint = input.codePointAt(i);
    const char = String.fromCodePoint(codePoint);
    const step = char.length;

    if (ellipsisIsWildcard && char === '.' && input.startsWith('...', i)) {
      pattern += '[\\s\\S]*?';
      i += 3;
      continue;
    }

    if (ellipsisIsWildcard && char === '\u2026') {
      pattern += '[\\s\\S]*?';
      i += step;
      continue;
    }

    if (/\s/.test(char)) {
      let j = i + step;
      while (j < length) {
        const nextCode = input.codePointAt(j);
        const nextChar = String.fromCodePoint(nextCode);
        if (!/\s/.test(nextChar)) break;
        j += nextChar.length;
      }
      pattern += '\\s+';
      i = j;
      continue;
    }

    if (char.match(/[-\u2010-\u2015\u2212\uFE63\uFF0D]/)) {
      pattern += HYPHEN_CLASS;
      i += step;
      continue;
    }

    if (['"', '“', '”'].includes(char)) {
      pattern += DOUBLE_QUOTE_PATTERN;
      i += step;
      continue;
    }

    if (["'", '’', '`'].includes(char)) {
      pattern += SINGLE_QUOTE_PATTERN;
      i += step;
      continue;
    }

    pattern += escapeRegExp(char);
    i += step;
  }

  return pattern;
}

function applyEntry(content, entry) {
  const { original, replacement, file } = entry;
  const diff = diffStrings(original, replacement);

  if (!diff.target.length && !diff.substitution.length) {
    return { content, count: 0, matched: false, diff };
  }

  const fullPattern = buildPattern(original, { ellipsisIsWildcard: true });
  const regex = new RegExp(fullPattern, 'g');
  const targetPattern = buildPattern(diff.target, { ellipsisIsWildcard: false });

  let match;
  let lastIndex = 0;
  let output = '';
  let count = 0;
  let matched = false;

  while ((match = regex.exec(content)) !== null) {
    matched = true;
    const fullMatch = match[0];
    const start = match.index;
    const end = start + fullMatch.length;
    const targetRegex = new RegExp(targetPattern);

    if (!targetRegex.test(fullMatch)) {
      throw new Error(
        `Context located in ${file}, but target fragment "${diff.target}" was not found within it.`,
      );
    }

    const updatedSegment = fullMatch.replace(targetRegex, diff.substitution);
    if (updatedSegment === fullMatch) {
      throw new Error(
        `Replacement produced no changes for "${diff.target}" in ${file}.`,
      );
    }

    output += content.slice(lastIndex, start) + updatedSegment;
    lastIndex = end;
    count++;
  }

  if (!matched) {
    const fallbackRegex = new RegExp(targetPattern);
    const fallbackMatch = fallbackRegex.exec(content);
    if (!fallbackMatch) {
      return { content, count: 0, matched: false, diff };
    }

    const start = fallbackMatch.index;
    const end = start + fallbackMatch[0].length;
    const updatedContent =
      content.slice(0, start) + diff.substitution + content.slice(end);

    return {
      content: updatedContent,
      count: 1,
      matched: true,
      diff,
    };
  }

  output += content.slice(lastIndex);
  return { content: output, count, matched: true, diff };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let manifest;

  try {
    const raw = await readFile(JSON_PATH, 'utf8');
    manifest = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read manifest ${JSON_PATH}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(manifest) || manifest.length === 0) {
    console.error(`❌ Manifest ${JSON_PATH} must contain an array of replacement entries.`);
    process.exit(1);
  }

  const entriesByFile = new Map();
  for (const entry of manifest) {
    if (
      !entry ||
      typeof entry.file !== 'string' ||
      typeof entry.original !== 'string' ||
      typeof entry.replacement !== 'string'
    ) {
      console.warn('⚠️  Skipping malformed entry:', entry);
      continue;
    }

    const normalizedFile = normalizePath(entry.file);
    if (!entriesByFile.has(normalizedFile)) {
      entriesByFile.set(normalizedFile, []);
    }
    entriesByFile.get(normalizedFile).push({
      ...entry,
      file: normalizedFile,
    });
  }

  let processedEntries = 0;
  const totalEntries = manifest.length;

  for (const [filePath, fileEntries] of entriesByFile.entries()) {
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch (err) {
      console.error(`❌ Cannot read ${filePath}: ${err.message}`);
      process.exit(1);
    }

    let originalContent = content;
    for (const entry of fileEntries) {
      const result = applyEntry(content, entry);
      if (!result.matched || result.count === 0) {
        const rel = relative(process.cwd(), entry.file);
        console.error(`❌ No match for entry in ${rel}: ${entry.original}`);
        process.exit(1);
      }

      content = result.content;
      processedEntries++;

      const relPath = relative(process.cwd(), entry.file);
      const summary = `${result.count} × "${result.diff.target}" → "${result.diff.substitution}"`;
      if (dryRun) {
        console.log(`🔍 Dry-run ${relPath}: ${summary}`);
      } else {
        console.log(`✅ Updated ${relPath}: ${summary}`);
      }
    }

    if (!dryRun && content !== originalContent) {
      await writeFile(filePath, content, 'utf8');
    }
  }

  console.log(
    `\n${dryRun ? 'Previewed' : 'Applied'} ${processedEntries}/${totalEntries} replacement entries.`,
  );
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
