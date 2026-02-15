import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listLaunchTaskStates, reconcileLaunchTaskState, } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { clearMailboxMessages, getMailboxPath, loadMailboxPayloadText, mailboxMessageTaskId, readMailboxMessages, sortMailboxMessages, summarizeMailboxPayload, } from "../utils/mailbox.js";
function formatDateTime(value) {
    if (!value) {
        return "unknown-time";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "unknown-time";
    }
    return parsed.toLocaleString();
}
function buildReceivedPayloadMessage(index, entry, payload) {
    return [
        `### Mailbox Payload [${index}]`,
        `- Task: \`${entry.taskId}\``,
        `- Status: \`${entry.status}\``,
        `- Time: ${entry.timeText}`,
        "",
        payload,
    ].join("\n");
}
function toPendingEntries(records) {
    return [...records]
        .sort((a, b) => {
        const left = Date.parse(b.last_heartbeat ?? b.started_at ?? b.created_at ?? "1970-01-01");
        const right = Date.parse(a.last_heartbeat ?? a.started_at ?? a.created_at ?? "1970-01-01");
        return left - right;
    })
        .map((record) => ({
        taskId: record.task_id,
        status: record.status,
        mode: record.execution_mode_actual ?? record.execution_mode_requested ?? "default",
        activityText: formatDateTime(record.last_heartbeat ?? record.started_at ?? record.created_at),
        templateId: record.template_id,
    }));
}
function toPreviewLines(text, maxLines, maxLineLength) {
    if (!text) {
        return ["(empty payload)"];
    }
    const sourceLines = text.replace(/\r\n/g, "\n").split("\n");
    const limited = [];
    for (const rawLine of sourceLines) {
        if (limited.length >= maxLines) {
            break;
        }
        if (rawLine.length <= maxLineLength) {
            limited.push(rawLine);
            continue;
        }
        limited.push(`${rawLine.slice(0, Math.max(0, maxLineLength - 3))}...`);
    }
    if (sourceLines.length > maxLines) {
        limited.push("... (truncated)");
    }
    return limited.length > 0 ? limited : ["(empty payload)"];
}
export function MailboxDialog({ baseDir, sessionId, onExit, onUsePayload, }) {
    const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
    const [focusSection, setFocusSection] = useState("received");
    const [receivedMessages, setReceivedMessages] = useState([]);
    const [pendingTasks, setPendingTasks] = useState([]);
    const [selectedReceivedKey, setSelectedReceivedKey] = useState(null);
    const [selectedPendingTaskId, setSelectedPendingTaskId] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const [previewText, setPreviewText] = useState("Select a mailbox item to preview its payload.");
    const [isLoading, setIsLoading] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const previewCacheRef = useRef(new Map());
    const mailboxPath = useMemo(() => getMailboxPath(baseDir, sessionId), [baseDir, sessionId]);
    const receivedEntries = useMemo(() => {
        return receivedMessages.map((message, index) => {
            const taskId = mailboxMessageTaskId(message);
            const status = message.status ?? "unknown";
            const timeText = formatDateTime(message.timestamp);
            return {
                key: `${taskId}:${message.timestamp ?? "0"}:${index}`,
                message,
                taskId,
                status,
                timeText,
                summary: summarizeMailboxPayload(message, 120),
            };
        });
    }, [receivedMessages]);
    const effectiveReceivedKey = useMemo(() => {
        if (selectedReceivedKey &&
            receivedEntries.some((entry) => entry.key === selectedReceivedKey)) {
            return selectedReceivedKey;
        }
        return receivedEntries[0]?.key ?? null;
    }, [selectedReceivedKey, receivedEntries]);
    const effectivePendingTaskId = useMemo(() => {
        if (selectedPendingTaskId &&
            pendingTasks.some((entry) => entry.taskId === selectedPendingTaskId)) {
            return selectedPendingTaskId;
        }
        return pendingTasks[0]?.taskId ?? null;
    }, [selectedPendingTaskId, pendingTasks]);
    const effectiveSelectedTarget = useMemo(() => {
        if (selectedTarget?.type === "received") {
            if (receivedEntries.some((entry) => entry.key === selectedTarget.key)) {
                return selectedTarget;
            }
        }
        else if (selectedTarget?.type === "pending") {
            if (pendingTasks.some((entry) => entry.taskId === selectedTarget.taskId)) {
                return selectedTarget;
            }
        }
        if (effectiveReceivedKey) {
            return { type: "received", key: effectiveReceivedKey };
        }
        if (effectivePendingTaskId) {
            return { type: "pending", taskId: effectivePendingTaskId };
        }
        return null;
    }, [
        selectedTarget,
        receivedEntries,
        pendingTasks,
        effectiveReceivedKey,
        effectivePendingTaskId,
    ]);
    const selectedReceivedIndex = useMemo(() => {
        if (!effectiveReceivedKey) {
            return 0;
        }
        const index = receivedEntries.findIndex((entry) => entry.key === effectiveReceivedKey);
        return index >= 0 ? index : 0;
    }, [effectiveReceivedKey, receivedEntries]);
    const selectedPendingIndex = useMemo(() => {
        if (!effectivePendingTaskId) {
            return 0;
        }
        const index = pendingTasks.findIndex((entry) => entry.taskId === effectivePendingTaskId);
        return index >= 0 ? index : 0;
    }, [effectivePendingTaskId, pendingTasks]);
    const receivedItems = useMemo(() => receivedEntries.map((entry) => ({
        value: entry.key,
        label: `${entry.taskId} [${entry.status}] - ${entry.summary}`,
    })), [receivedEntries]);
    const pendingItems = useMemo(() => pendingTasks.map((entry) => ({
        value: entry.taskId,
        label: `${entry.taskId} (${entry.status}, ${entry.mode}, ${entry.activityText})`,
    })), [pendingTasks]);
    const reloadMailbox = useCallback(async (options) => {
        setErrorMessage(null);
        if (!options?.background) {
            setIsBusy(true);
        }
        try {
            await reconcileLaunchTaskState(baseDir);
            const [rawMessages, pendingRecords] = await Promise.all([
                readMailboxMessages(mailboxPath),
                listLaunchTaskStates(baseDir, {
                    parentSessionId: sessionId,
                    statuses: ["queued", "running"],
                    limit: 100,
                }),
            ]);
            setReceivedMessages(sortMailboxMessages(rawMessages));
            setPendingTasks(toPendingEntries(pendingRecords));
            if (options?.status) {
                setStatusMessage(options.status);
            }
        }
        catch (error) {
            setErrorMessage(`Failed to load mailbox: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            if (!options?.background) {
                setIsBusy(false);
            }
            setIsLoading(false);
        }
    }, [baseDir, mailboxPath, sessionId]);
    useEffect(() => {
        void reloadMailbox();
        const timer = setInterval(() => {
            void reloadMailbox({ background: true });
        }, 3000);
        return () => {
            clearInterval(timer);
        };
    }, [reloadMailbox]);
    useEffect(() => {
        let cancelled = false;
        if (!effectiveSelectedTarget) {
            setPreviewText("No mailbox entries available.");
            setIsLoadingPreview(false);
            return () => {
                cancelled = true;
            };
        }
        if (effectiveSelectedTarget.type === "pending") {
            const entry = pendingTasks.find((item) => item.taskId === effectiveSelectedTarget.taskId);
            if (!entry) {
                setPreviewText("No pending task selected.");
            }
            else {
                const templateInfo = entry.templateId
                    ? `\nTemplate: ${entry.templateId}`
                    : "";
                setPreviewText([
                    "Pending Task",
                    `Task: ${entry.taskId}`,
                    `Status: ${entry.status}`,
                    `Mode: ${entry.mode}`,
                    `Last Activity: ${entry.activityText}${templateInfo}`,
                ].join("\n"));
            }
            setIsLoadingPreview(false);
            return () => {
                cancelled = true;
            };
        }
        const entry = receivedEntries.find((item) => item.key === effectiveSelectedTarget.key);
        if (!entry) {
            setPreviewText("No mailbox message selected.");
            setIsLoadingPreview(false);
            return () => {
                cancelled = true;
            };
        }
        const cached = previewCacheRef.current.get(entry.key);
        if (cached) {
            setPreviewText(cached);
            setIsLoadingPreview(false);
            return () => {
                cancelled = true;
            };
        }
        setIsLoadingPreview(true);
        void (async () => {
            try {
                const payload = await loadMailboxPayloadText(entry.message);
                if (cancelled) {
                    return;
                }
                previewCacheRef.current.set(entry.key, payload);
                setPreviewText(payload);
            }
            catch (error) {
                if (cancelled) {
                    return;
                }
                setPreviewText(`Unable to load payload: ${error instanceof Error ? error.message : String(error)}`);
            }
            finally {
                if (!cancelled) {
                    setIsLoadingPreview(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [effectiveSelectedTarget, pendingTasks, receivedEntries]);
    const handleUseSelectedPayload = useCallback(async () => {
        if (!effectiveSelectedTarget || effectiveSelectedTarget.type !== "received") {
            setErrorMessage("Select a received payload before using it.");
            return;
        }
        const entry = receivedEntries.find((item) => item.key === effectiveSelectedTarget.key);
        if (!entry) {
            setErrorMessage("Selected payload is no longer available.");
            return;
        }
        setIsBusy(true);
        setErrorMessage(null);
        try {
            const payload = await loadMailboxPayloadText(entry.message);
            const index = receivedEntries.findIndex((item) => item.key === entry.key) + 1;
            const message = buildReceivedPayloadMessage(index, entry, payload);
            await onUsePayload(message);
            onExit();
        }
        catch (error) {
            setErrorMessage(`Failed to use payload: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsBusy(false);
        }
    }, [effectiveSelectedTarget, receivedEntries, onUsePayload, onExit]);
    const actionItems = [
        { label: "Use Selected Payload", value: "use" },
        { label: "Refresh", value: "refresh" },
        { label: "Clear Received", value: "clear" },
        { label: "Close", value: "close" },
    ];
    const handleActionSelect = useCallback((value) => {
        if (isBusy) {
            return;
        }
        if (value === "use") {
            void handleUseSelectedPayload();
            return;
        }
        if (value === "refresh") {
            void reloadMailbox({ status: "Mailbox refreshed." });
            return;
        }
        if (value === "clear") {
            void (async () => {
                setIsBusy(true);
                setErrorMessage(null);
                try {
                    await clearMailboxMessages(mailboxPath);
                    previewCacheRef.current.clear();
                    await reloadMailbox({
                        status: `Cleared mailbox entries for "${sessionId}".`,
                    });
                }
                catch (error) {
                    setErrorMessage(`Failed to clear mailbox: ${error instanceof Error ? error.message : String(error)}`);
                }
                finally {
                    setIsBusy(false);
                }
            })();
            return;
        }
        onExit();
    }, [
        isBusy,
        handleUseSelectedPayload,
        reloadMailbox,
        mailboxPath,
        sessionId,
        onExit,
    ]);
    useKeypress((key) => {
        if (key.name === "escape") {
            onExit();
            return;
        }
        if (key.name === "tab") {
            const order = ["received", "pending", "actions", "preview"];
            setFocusSection((current) => {
                const currentIndex = order.indexOf(current);
                const nextIndex = key.shift
                    ? (currentIndex - 1 + order.length) % order.length
                    : (currentIndex + 1) % order.length;
                return order[nextIndex];
            });
        }
    }, { isActive: true });
    const listMaxItems = Math.max(6, Math.min(12, Math.floor(terminalRows * 0.28)));
    const actionMaxItems = Math.max(4, Math.min(8, Math.floor(terminalRows * 0.2)));
    const previewMaxLines = Math.max(8, Math.min(20, Math.floor(terminalRows * 0.33)));
    const previewMaxLineLength = Math.max(48, Math.min(120, Math.floor(terminalColumns * 0.44)));
    const previewLines = useMemo(() => toPreviewLines(previewText, previewMaxLines, previewMaxLineLength), [previewText, previewMaxLines, previewMaxLineLength]);
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", width: "100%", padding: 1, gap: 1, children: [_jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "received" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "received", children: [focusSection === "received" ? "> " : "  ", "Received (", receivedEntries.length, ")"] }), isLoading ? (_jsx(Text, { color: Colors.Gray, children: "Loading mailbox..." })) : receivedItems.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No received payloads yet." })) : (_jsx(RadioButtonSelect, { items: receivedItems, initialIndex: selectedReceivedIndex, onSelect: (key) => {
                                    setSelectedReceivedKey(key);
                                    setSelectedTarget({ type: "received", key });
                                }, onHighlight: (key) => {
                                    setSelectedReceivedKey(key);
                                    setSelectedTarget({ type: "received", key });
                                }, isFocused: focusSection === "received", maxItemsToShow: listMaxItems, showScrollArrows: true }, `received-${receivedItems.length}-${selectedReceivedIndex}`))] }), _jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "pending" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "pending", children: [focusSection === "pending" ? "> " : "  ", "Pending (", pendingTasks.length, ")"] }), isLoading ? (_jsx(Text, { color: Colors.Gray, children: "Loading pending tasks..." })) : pendingItems.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No queued/running tasks." })) : (_jsx(RadioButtonSelect, { items: pendingItems, initialIndex: selectedPendingIndex, onSelect: (taskId) => {
                                    setSelectedPendingTaskId(taskId);
                                    setSelectedTarget({ type: "pending", taskId });
                                }, onHighlight: (taskId) => {
                                    setSelectedPendingTaskId(taskId);
                                    setSelectedTarget({ type: "pending", taskId });
                                }, isFocused: focusSection === "pending", maxItemsToShow: listMaxItems, showScrollArrows: true }, `pending-${pendingItems.length}-${selectedPendingIndex}`))] })] }), _jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "actions" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "actions", children: [focusSection === "actions" ? "> " : "  ", "Actions"] }), _jsx(RadioButtonSelect, { items: actionItems, initialIndex: 0, onSelect: handleActionSelect, isFocused: focusSection === "actions", maxItemsToShow: actionMaxItems, showScrollArrows: true }, `mailbox-actions-${isBusy ? "busy" : "idle"}`), statusMessage && _jsx(Text, { color: Colors.AccentGreen, children: statusMessage }), errorMessage && _jsx(Text, { color: Colors.AccentRed, children: errorMessage })] }), _jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "preview" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "preview", children: [focusSection === "preview" ? "> " : "  ", "Preview"] }), isLoadingPreview ? (_jsx(Text, { color: Colors.Gray, children: "Loading payload preview..." })) : (previewLines.map((line, index) => (_jsx(Text, { wrap: "truncate-end", children: line || " " }, `preview-${index}`))))] })] }), _jsx(Text, { color: Colors.Gray, children: "Tab cycles panels: Received, Pending, Actions, Preview. Enter selects. Esc closes." })] }));
}
//# sourceMappingURL=MailboxDialog.js.map