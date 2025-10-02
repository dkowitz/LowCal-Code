/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Proactive validation and warnings for tool calls that may produce large results
 */

export interface ToolCallWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
}

/**
 * Checks if a regex pattern is too broad/vague
 */
function isVaguePattern(pattern: string): boolean {
  // Patterns that are likely to match too much
  const vaguePatterns = [
    /^[a-z]+$/i, // Single word without special regex chars
    /^\.+$/,     // Just dots
    /^\*+$/,     // Just asterisks
    /^debug$/i,
    /^test$/i,
    /^error$/i,
    /^function$/i,
    /^class$/i,
    /^import$/i,
    /^export$/i,
  ];

  return vaguePatterns.some((vague) => vague.test(pattern));
}

/**
 * Validates search_file_content parameters
 */
export function validateSearchFileContent(params: {
  pattern: string;
  path?: string;
  include?: string;
}): ToolCallWarning | null {
  const { pattern, include } = params;

  // Check for overly broad patterns without file filters
  if (!include && isVaguePattern(pattern)) {
    return {
      severity: 'warning',
      message: `Pattern "${pattern}" may return thousands of results without a file filter.`,
      suggestion: `Consider adding an 'include' filter (e.g., '**/*.ts', 'src/**/*.js') or using a more specific regex pattern.`,
    };
  }

  // Check for patterns that match everything
  if (pattern === '.*' || pattern === '.+' || pattern === '.*?') {
    return {
      severity: 'warning',
      message: `Pattern "${pattern}" will match every line in every file.`,
      suggestion: `Use a more specific pattern or combine with a narrow 'include' filter.`,
    };
  }

  // Check for very short patterns
  if (pattern.length <= 2 && !pattern.match(/[\\^$.*+?()[\]{}|]/)) {
    return {
      severity: 'info',
      message: `Very short pattern "${pattern}" may produce many results.`,
      suggestion: `Consider using a longer or more specific pattern.`,
    };
  }

  return null;
}

/**
 * Validates read_many_files parameters
 */
export function validateReadManyFiles(params: {
  paths: string[];
  include?: string[];
  recursive?: boolean;
}): ToolCallWarning | null {
  const { paths, include, recursive = true } = params;

  // Check for overly broad path patterns
  const broadPatterns = ['**/*', '**', '*', '.'];
  const hasBroadPattern = paths.some((p) => broadPatterns.includes(p));

  if (hasBroadPattern && !include && recursive) {
    return {
      severity: 'warning',
      message: `Reading all files recursively may produce very large results.`,
      suggestion: `Consider adding 'include' filters (e.g., ['**/*.ts', '**/*.md']) or setting 'recursive: false'.`,
    };
  }

  // Check for too many paths
  if (paths.length > 50) {
    return {
      severity: 'warning',
      message: `Reading ${paths.length} paths may produce very large results.`,
      suggestion: `Consider breaking this into multiple smaller read operations or using more specific patterns.`,
    };
  }

  return null;
}

/**
 * Validates glob parameters
 */
export function validateGlob(params: {
  pattern: string;
  path?: string;
}): ToolCallWarning | null {
  const { pattern } = params;

  // Check for patterns that will match everything
  if (pattern === '**/*' || pattern === '**') {
    return {
      severity: 'info',
      message: `Pattern "${pattern}" will list all files in the directory tree.`,
      suggestion: `Consider using a more specific pattern if you're looking for particular file types.`,
    };
  }

  return null;
}

/**
 * Main validation function - routes to specific validators
 */
export function validateToolCall(
  toolName: string,
  params: Record<string, unknown>,
): ToolCallWarning | null {
  switch (toolName) {
    case 'search_file_content':
      return validateSearchFileContent(params as Parameters<typeof validateSearchFileContent>[0]);
    case 'read_many_files':
      return validateReadManyFiles(params as Parameters<typeof validateReadManyFiles>[0]);
    case 'glob':
      return validateGlob(params as Parameters<typeof validateGlob>[0]);
    default:
      return null;
  }
}

/**
 * Formats a warning for display
 */
export function formatToolWarning(warning: ToolCallWarning): string {
  const icon = warning.severity === 'error' ? '❌' : warning.severity === 'warning' ? '⚠️' : 'ℹ️';
  let message = `${icon} ${warning.message}`;
  if (warning.suggestion) {
    message += `\n   💡 ${warning.suggestion}`;
  }
  return message;
}
