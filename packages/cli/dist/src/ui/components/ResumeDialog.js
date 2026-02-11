import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";
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
function formatCheckpointLabel(checkpoint) {
    const isoString = checkpoint.createdAt.toISOString();
    const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
    const formattedDate = match ? `${match[1]} ${match[2]}` : "Invalid Date";
    const shortSessionId = checkpoint.sessionId.slice(0, 8);
    const sessionColor = getSessionColor(checkpoint.sessionId);
    const preview = checkpoint.lastMessagePreview
        ? ` - ${checkpoint.lastMessagePreview}`
        : "";
    return (_jsxs(Text, { children: [_jsxs(Text, { color: Colors.Gray, children: ["[", checkpoint.messageCount, " messages]"] }), " ", _jsx(Text, { color: sessionColor, children: shortSessionId }), " ", formattedDate, preview] }));
}
export const ResumeDialog = ({ checkpoints, onSelect, onClose, }) => {
    useKeypress((key) => {
        if (key.name === "escape") {
            onClose();
        }
    }, { isActive: true });
    const options = checkpoints.map((checkpoint) => ({
        label: formatCheckpointLabel(checkpoint),
        value: checkpoint.id,
    }));
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentBlue, padding: 1, width: "100%", marginLeft: 1, children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Resume Conversation" }), _jsx(Text, { children: "Select a checkpoint to restore:" })] }), options.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No saved conversation checkpoints found." })) : (_jsx(Box, { marginBottom: 1, children: _jsx(RadioButtonSelect, { items: options, initialIndex: 0, onSelect: onSelect, isFocused: true, showScrollArrows: true, maxItemsToShow: 12 }) })), _jsx(Box, { children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to select, Esc to cancel" }) })] }));
};
//# sourceMappingURL=ResumeDialog.js.map