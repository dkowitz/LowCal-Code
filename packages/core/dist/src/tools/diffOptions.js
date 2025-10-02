/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as Diff from 'diff';
export const DEFAULT_DIFF_OPTIONS = {
    context: 3,
    ignoreWhitespace: true,
};
export function getDiffStat(fileName, oldStr, aiStr, userStr) {
    const countLines = (patch) => {
        let added = 0;
        let removed = 0;
        patch.hunks.forEach((hunk) => {
            hunk.lines.forEach((line) => {
                if (line.startsWith('+')) {
                    added++;
                }
                else if (line.startsWith('-')) {
                    removed++;
                }
            });
        });
        return { added, removed };
    };
    const patch = Diff.structuredPatch(fileName, fileName, oldStr, aiStr, 'Current', 'Proposed', DEFAULT_DIFF_OPTIONS);
    const { added: aiAddedLines, removed: aiRemovedLines } = countLines(patch);
    const userPatch = Diff.structuredPatch(fileName, fileName, aiStr, userStr, 'Proposed', 'User', DEFAULT_DIFF_OPTIONS);
    const { added: userAddedLines, removed: userRemovedLines } = countLines(userPatch);
    return {
        ai_added_lines: aiAddedLines,
        ai_removed_lines: aiRemovedLines,
        user_added_lines: userAddedLines,
        user_removed_lines: userRemovedLines,
    };
}
//# sourceMappingURL=diffOptions.js.map