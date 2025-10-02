/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Estimates token count from character count (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(chars) {
    return Math.ceil(chars / 4);
}
/**
 * Truncation strategy for search_file_content results
 * Keeps first N and last N matches, summarizes the middle
 */
export function truncateSearchResults(content, maxChars = 20000) {
    const originalSize = content.length;
    if (originalSize <= maxChars) {
        return {
            content,
            wasTruncated: false,
            originalSize,
            truncatedSize: originalSize,
        };
    }
    const lines = content.split('\n');
    // Extract header (first line with "Found X matches")
    const headerLine = lines[0] || '';
    const matchCountMatch = headerLine.match(/Found (\d+) match/);
    const totalMatches = matchCountMatch ? parseInt(matchCountMatch[1], 10) : 0;
    // Find file sections (lines starting with "File:")
    const fileSections = [];
    let currentFileStart = -1;
    let currentFile = '';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('File: ')) {
            if (currentFileStart !== -1) {
                fileSections.push({
                    start: currentFileStart,
                    end: i - 1,
                    file: currentFile,
                });
            }
            currentFileStart = i;
            currentFile = line.substring(6);
        }
    }
    // Add last section
    if (currentFileStart !== -1) {
        fileSections.push({
            start: currentFileStart,
            end: lines.length - 1,
            file: currentFile,
        });
    }
    // Strategy: Keep first 30 and last 30 file sections, summarize middle
    const keepFirst = 30;
    const keepLast = 30;
    if (fileSections.length <= keepFirst + keepLast) {
        // Not too many files, just truncate long lines within each file
        const truncatedLines = lines.map((line) => {
            if (line.length > 500) {
                return line.substring(0, 500) + '... [line truncated]';
            }
            return line;
        });
        const truncatedContent = truncatedLines.join('\n');
        return {
            content: truncatedContent,
            wasTruncated: true,
            originalSize,
            truncatedSize: truncatedContent.length,
            summary: `Truncated long lines. Original: ${originalSize} chars (~${estimateTokens(originalSize)} tokens)`,
        };
    }
    // Too many file sections - keep first/last, summarize middle
    const headSections = fileSections.slice(0, keepFirst);
    const tailSections = fileSections.slice(-keepLast);
    const omittedSections = fileSections.slice(keepFirst, -keepLast);
    const headLines = lines.slice(0, headSections[headSections.length - 1].end + 1);
    const tailLines = lines.slice(tailSections[0].start);
    const omittedFiles = omittedSections.map((s) => s.file);
    const omittedMatchCount = omittedSections.reduce((sum, section) => {
        const sectionLines = lines.slice(section.start, section.end + 1);
        const matches = sectionLines.filter((l) => l.match(/^L\d+:/)).length;
        return sum + matches;
    }, 0);
    const summarySection = [
        '',
        '... [TRUNCATED FOR CONTEXT MANAGEMENT] ...',
        '',
        `Omitted ${omittedSections.length} files with ${omittedMatchCount} matches:`,
        ...omittedFiles.slice(0, 10).map((f) => `  - ${f}`),
        ...(omittedFiles.length > 10 ? [`  ... and ${omittedFiles.length - 10} more files`] : []),
        '',
        `[Total: ${totalMatches} matches across ${fileSections.length} files]`,
        `[Original size: ${originalSize} chars (~${estimateTokens(originalSize)} tokens)]`,
        `[Showing first ${keepFirst} and last ${keepLast} files for context]`,
        `[Use more specific patterns or read_file for omitted files]`,
        '',
        '... [CONTINUING WITH LAST MATCHES] ...',
        '',
    ];
    const truncatedContent = [...headLines, ...summarySection, ...tailLines].join('\n');
    return {
        content: truncatedContent,
        wasTruncated: true,
        originalSize,
        truncatedSize: truncatedContent.length,
        summary: `Truncated ${omittedSections.length} file sections. Kept first ${keepFirst} and last ${keepLast} files.`,
    };
}
/**
 * Truncation strategy for read_many_files results
 */
export function truncateReadManyFiles(content, maxChars = 30000) {
    const originalSize = content.length;
    if (originalSize <= maxChars) {
        return {
            content,
            wasTruncated: false,
            originalSize,
            truncatedSize: originalSize,
        };
    }
    // Split by file separators (--- filepath ---)
    const fileSeparatorRegex = /^--- (.+?) ---$/gm;
    const parts = [];
    let match;
    while ((match = fileSeparatorRegex.exec(content)) !== null) {
        if (parts.length > 0) {
            parts[parts.length - 1].content = content.substring(parts[parts.length - 1].start, match.index);
        }
        parts.push({
            file: match[1],
            content: '',
            start: match.index + match[0].length,
        });
    }
    if (parts.length > 0) {
        parts[parts.length - 1].content = content.substring(parts[parts.length - 1].start);
    }
    // Keep first 10 and last 10 files, summarize middle
    const keepFirst = 10;
    const keepLast = 10;
    if (parts.length <= keepFirst + keepLast) {
        // Truncate each file's content instead
        const truncatedParts = parts.map((part) => {
            if (part.content.length > 2000) {
                const lines = part.content.split('\n');
                const kept = lines.slice(0, 50).join('\n');
                return `--- ${part.file} ---\n${kept}\n... [${lines.length - 50} lines omitted] ...\n`;
            }
            return `--- ${part.file} ---\n${part.content}`;
        });
        const truncatedContent = truncatedParts.join('\n');
        return {
            content: truncatedContent,
            wasTruncated: true,
            originalSize,
            truncatedSize: truncatedContent.length,
            summary: `Truncated long file contents. Original: ${originalSize} chars`,
        };
    }
    const headParts = parts.slice(0, keepFirst);
    const tailParts = parts.slice(-keepLast);
    const omittedParts = parts.slice(keepFirst, -keepLast);
    const headContent = headParts.map((p) => `--- ${p.file} ---\n${p.content}`).join('\n');
    const tailContent = tailParts.map((p) => `--- ${p.file} ---\n${p.content}`).join('\n');
    const summarySection = [
        '',
        '... [TRUNCATED FOR CONTEXT MANAGEMENT] ...',
        '',
        `Omitted ${omittedParts.length} files:`,
        ...omittedParts.slice(0, 20).map((p) => `  - ${p.file}`),
        ...(omittedParts.length > 20 ? [`  ... and ${omittedParts.length - 20} more`] : []),
        '',
        `[Total: ${parts.length} files, ${originalSize} chars (~${estimateTokens(originalSize)} tokens)]`,
        `[Use read_file to access omitted files individually]`,
        '',
    ].join('\n');
    const truncatedContent = headContent + '\n' + summarySection + '\n' + tailContent;
    return {
        content: truncatedContent,
        wasTruncated: true,
        originalSize,
        truncatedSize: truncatedContent.length,
        summary: `Truncated ${omittedParts.length} files. Kept first ${keepFirst} and last ${keepLast}.`,
    };
}
/**
 * Generic truncation for other tools
 */
export function truncateGeneric(content, maxChars = 15000) {
    const originalSize = content.length;
    if (originalSize <= maxChars) {
        return {
            content,
            wasTruncated: false,
            originalSize,
            truncatedSize: originalSize,
        };
    }
    const keepChars = Math.floor(maxChars * 0.8);
    const headChars = Math.floor(keepChars * 0.6);
    const tailChars = keepChars - headChars;
    const head = content.substring(0, headChars);
    const tail = content.substring(content.length - tailChars);
    const summary = [
        '',
        '... [TRUNCATED FOR CONTEXT MANAGEMENT] ...',
        '',
        `[Omitted ${originalSize - keepChars} characters]`,
        `[Original: ${originalSize} chars (~${estimateTokens(originalSize)} tokens)]`,
        '',
    ].join('\n');
    const truncatedContent = head + summary + tail;
    return {
        content: truncatedContent,
        wasTruncated: true,
        originalSize,
        truncatedSize: truncatedContent.length,
        summary: `Truncated to ${truncatedContent.length} chars from ${originalSize}`,
    };
}
/**
 * Tool-specific truncation strategies
 */
export const TRUNCATION_STRATEGIES = {
    search_file_content: {
        maxChars: 20000,
        truncate: (content, _size) => truncateSearchResults(content, 20000),
    },
    read_many_files: {
        maxChars: 30000,
        truncate: (content, _size) => truncateReadManyFiles(content, 30000),
    },
    glob: {
        maxChars: 10000,
        truncate: (content, _size) => truncateGeneric(content, 10000),
    },
    run_shell_command: {
        maxChars: 15000,
        truncate: (content, _size) => truncateGeneric(content, 15000),
    },
};
/**
 * Apply smart truncation to tool result content
 */
export function applySmartTruncation(toolName, content) {
    const strategy = TRUNCATION_STRATEGIES[toolName];
    if (!strategy) {
        // No specific strategy, use generic with high threshold
        return truncateGeneric(content, 50000);
    }
    return strategy.truncate(content, content.length);
}
//# sourceMappingURL=result-truncation.js.map