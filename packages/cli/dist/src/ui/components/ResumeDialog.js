import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { TextInput } from "./shared/TextInput.js";
// Color codes for different session IDs - consistent with resumeCommand.ts
const getSessionColor = (sessionId) => {
    // Use the first few characters of the session ID to generate a consistent color
    const hash = sessionId.substring(0, 8);
    const num = parseInt(hash, 16) || 0;
    // Map to Ink colors that work well with themes
    const colors = [
        Colors.AccentBlue,
        Colors.AccentPurple,
        Colors.AccentCyan,
        Colors.AccentGreen,
        Colors.AccentYellow,
        Colors.AccentRed,
        Colors.LightBlue,
    ];
    return colors[num % colors.length];
};
/**
 * Extract a context snippet around the first occurrence of the search term.
 * Returns a string with the search term surrounded by context.
 */
function extractSearchContext(fullContent, searchTerm, contextSize = 25) {
    const searchLower = searchTerm.toLowerCase();
    const contentLower = fullContent.toLowerCase();
    const index = contentLower.indexOf(searchLower);
    if (index === -1)
        return "";
    const start = Math.max(0, index - contextSize);
    const end = Math.min(fullContent.length, index + searchTerm.length + contextSize);
    let snippet = fullContent.substring(start, end);
    // Add ellipsis if truncated
    if (start > 0)
        snippet = "…" + snippet;
    if (end < fullContent.length)
        snippet = snippet + "…";
    return snippet;
}
/**
 * Format a text string with the search term highlighted.
 * Returns React nodes with the matched term in bold/highlighted color.
 */
function formatWithHighlight(text, searchTerm) {
    if (!searchTerm.trim())
        return [text];
    const searchLower = searchTerm.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(searchLower);
    if (index === -1)
        return [text];
    const before = text.substring(0, index);
    const match = text.substring(index, index + searchTerm.length);
    const after = text.substring(index + searchTerm.length);
    return [
        _jsx(Text, { children: before }, "before"),
        _jsx(Text, { bold: true, color: Colors.AccentCyan, children: match }, "match"),
        _jsx(Text, { children: after }, "after"),
    ];
}
function formatCheckpointLabel(checkpoint, searchTerm) {
    const isoString = checkpoint.createdAt.toISOString();
    const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
    const formattedDate = match ? `${match[1]} ${match[2]}` : "Invalid Date";
    const shortSessionId = checkpoint.sessionId.slice(0, 8);
    const sessionColor = getSessionColor(checkpoint.sessionId);
    // Build the preview part
    let previewNode = "";
    if (searchTerm && checkpoint.searchContext) {
        // Show search context with highlighting
        previewNode = formatWithHighlight(` - ${checkpoint.searchContext}`, searchTerm);
    }
    else if (checkpoint.lastMessagePreview) {
        // Show regular last message preview
        previewNode = ` - ${checkpoint.lastMessagePreview}`;
    }
    return (_jsxs(Text, { children: [_jsxs(Text, { color: Colors.Gray, children: ["[", checkpoint.messageCount, " messages]"] }), " ", _jsx(Text, { color: sessionColor, children: shortSessionId }), " ", formattedDate, previewNode] }));
}
export const ResumeDialog = ({ checkpoints, onSelect, onClose, }) => {
    const [searchTerm, setSearchTerm] = useState("");
    useKeypress((key) => {
        if (key.name === "escape") {
            onClose();
        }
    }, { isActive: true });
    // Filter checkpoints based on search term
    const filteredCheckpoints = checkpoints.filter((checkpoint) => {
        if (!searchTerm.trim())
            return true;
        const searchLower = searchTerm.toLowerCase();
        return checkpoint.fullContent.toLowerCase().includes(searchLower);
    }).map((checkpoint) => {
        // Add search context if there's a search term
        if (searchTerm.trim()) {
            return {
                ...checkpoint,
                searchContext: extractSearchContext(checkpoint.fullContent, searchTerm),
            };
        }
        return checkpoint;
    });
    const options = filteredCheckpoints.map((checkpoint) => ({
        label: formatCheckpointLabel(checkpoint, searchTerm),
        value: checkpoint.id,
    }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentBlue, padding: 1, width: "100%", marginLeft: 1, children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Resume Conversation" }), _jsx(Text, { children: "Select a checkpoint to restore:" })] }), _jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { color: Colors.Gray, children: "Search conversations:" }), _jsx(TextInput, { value: searchTerm, onChange: setSearchTerm, placeholder: "Type to search across all conversations...", onSubmit: () => { }, inputWidth: 60 }), searchTerm && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: Colors.Gray, children: ["Found ", filteredCheckpoints.length, " of ", checkpoints.length, " checkpoint", filteredCheckpoints.length !== 1 ? "s" : ""] }) }))] }), options.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: searchTerm
                    ? `No conversations match "${searchTerm}".`
                    : "No saved conversation checkpoints found." })) : (_jsx(Box, { marginBottom: 1, children: _jsx(RadioButtonSelect, { items: options, initialIndex: 0, onSelect: onSelect, isFocused: true, showScrollArrows: true, maxItemsToShow: 12 }) })), _jsx(Box, { children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to select, Esc to cancel" }) })] }));
};
//# sourceMappingURL=ResumeDialog.js.map