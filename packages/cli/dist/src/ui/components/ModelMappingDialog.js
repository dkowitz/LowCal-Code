import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { Box, Text } from 'ink';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
export const ModelMappingDialog = ({ unmatched, restModels, onApply, onCancel }) => {
    // Simple UX: for each unmatched model, pick best REST candidate by index
    const [selections, setSelections] = React.useState(() => ({}));
    const [activeIndex, setActiveIndex] = React.useState(0);
    const handleSelectFor = (configuredKey, restId) => {
        setSelections((s) => ({ ...s, [configuredKey]: restId }));
        // Persist single mapping immediately so it sticks even if the user
        // accidentally triggers other UI actions. Only persist non-empty mappings.
        if (restId) {
            (async () => {
                try {
                    const storage = await import('../models/modelMappingStorage.js');
                    const existing = await storage.loadMappings();
                    const merged = { ...existing, [configuredKey]: restId };
                    await storage.saveMappings(merged);
                    console.log('[LMStudio] Auto-persisted mapping for', configuredKey, restId);
                }
                catch (e) {
                    console.log('[LMStudio] Failed to auto-persist mapping for', configuredKey, e);
                }
            })();
        }
    };
    // Move focus to next unmatched entry when a selection is made
    const handleSelectedAndAdvance = (configuredKey, restId) => {
        handleSelectFor(configuredKey, restId);
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, unmatched.length - 1)));
    };
    // Handle global keypresses: Enter to apply, Esc to cancel, Tab to move next, Shift-Tab to move prev
    useKeypress((key) => {
        const { name } = key;
        if (name === 'escape') {
            onCancel();
            return;
        }
        if (name === 'tab') {
            setActiveIndex((i) => (i + 1) % Math.max(1, unmatched.length));
            return;
        }
        if (name === 'shift+tab') {
            setActiveIndex((i) => (i - 1 + unmatched.length) % Math.max(1, unmatched.length));
            return;
        }
        if (name === 'return') {
            // Build mappings for non-empty selections
            const mappings = {};
            for (const u of unmatched) {
                const key = u.configuredName ?? u.label;
                const v = selections[key];
                if (v)
                    mappings[key] = v;
            }
            // Persist mappings immediately from the dialog to make sure they stick
            (async () => {
                try {
                    const storage = await import('../models/modelMappingStorage.js');
                    const existing = await storage.loadMappings();
                    const merged = { ...existing, ...mappings };
                    await storage.saveMappings(merged);
                    console.debug('[LMStudio] ModelMappingDialog persisted mappings:', merged);
                }
                catch (e) {
                    console.debug('[LMStudio] ModelMappingDialog failed to persist mappings:', e);
                }
            })();
            onApply(mappings);
            return;
        }
    }, { isActive: true });
    React.useEffect(() => {
        // noop: keep selections in sync if needed
    }, [selections]);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", padding: 1, width: "100%", children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Map configured models to provider models" }), _jsx(Text, { children: "Some configured models didn't match any provider model. Choose the best match or leave blank to skip." })] }), unmatched.map((u, idx) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Text, { children: [u.label, " (configured: ", u.configuredContextLength?.toLocaleString() ?? '?', " ctx)"] }), _jsx(Box, { children: _jsx(RadioButtonSelect, { items: [{ label: '(skip)', value: '' }, ...restModels.map(r => ({ label: r.id, value: r.id }))], initialIndex: 0, onSelect: (val) => handleSelectedAndAdvance(u.configuredName ?? u.label, val), isFocused: activeIndex === idx }) })] }, u.label))), _jsx(Box, { children: _jsx(Text, { children: "Press Enter to save mappings, Esc to cancel. Use Tab to move between entries." }) })] }));
};
//# sourceMappingURL=ModelMappingDialog.js.map