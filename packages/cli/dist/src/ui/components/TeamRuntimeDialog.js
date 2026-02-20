import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listTeamStates } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { getOrchestratorStatus, } from "../../orchestrator/daemon.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { TextInput } from "./shared/TextInput.js";
const DM_CHANNEL_PREFIX = "@dm:";
const FOCUS_ORDER = [
    "teams",
    "channels",
    "feed",
    "actions",
    "compose_meta",
    "compose_input",
];
const COMPOSE_MODES = ["public", "dm", "prompt"];
const FEED_SCOPES = ["selected_channel", "all_channels", "inbox"];
const MESSAGE_TYPES = [
    "instruction",
    "task_update",
    "result",
    "question",
    "clarification",
    "chat",
    "dm",
];
function quoteForShell(value) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
}
function resolveChannelPath(baseDir, relativeOrAbsolute) {
    return path.isAbsolute(relativeOrAbsolute)
        ? relativeOrAbsolute
        : path.resolve(baseDir, relativeOrAbsolute);
}
function parseDmParticipants(channelName) {
    if (!channelName.startsWith(DM_CHANNEL_PREFIX)) {
        return undefined;
    }
    const payload = channelName.slice(DM_CHANNEL_PREFIX.length);
    const segments = payload.split("|");
    if (segments.length !== 2) {
        return undefined;
    }
    const left = segments[0]?.trim();
    const right = segments[1]?.trim();
    if (!left || !right) {
        return undefined;
    }
    return [left, right];
}
function isPublicChannel(channelName) {
    return !channelName.startsWith(DM_CHANNEL_PREFIX);
}
function formatTime(value) {
    if (!value) {
        return "--:--:--";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "--:--:--";
    }
    return parsed.toLocaleTimeString();
}
function formatTimestamp(value) {
    if (!value) {
        return "unknown";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "unknown";
    }
    return parsed.toLocaleString();
}
function formatPreview(value, max = 120) {
    if (!value) {
        return "";
    }
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= max) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, max - 3))}...`;
}
function normalizeChannelName(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("@")) {
        return trimmed;
    }
    return `#${trimmed}`;
}
function cycleValue(values, current, direction = 1) {
    if (values.length === 0) {
        return current;
    }
    const index = values.findIndex((entry) => entry === current);
    const start = index >= 0 ? index : 0;
    const nextIndex = (start + direction + values.length) % values.length;
    return values[nextIndex];
}
function safeMessageType(value) {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (MESSAGE_TYPES.includes(normalized)) {
            return normalized;
        }
    }
    return "chat";
}
function parseMessageLine(rawLine, fallbackChannel) {
    let parsed;
    try {
        parsed = JSON.parse(rawLine);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    const record = parsed;
    const contentRaw = record["content"] && typeof record["content"] === "object"
        ? record["content"]
        : undefined;
    const text = contentRaw?.["text"];
    if (typeof text !== "string") {
        return null;
    }
    const timestamp = typeof record["timestamp"] === "string"
        ? record["timestamp"]
        : new Date(0).toISOString();
    const turnNumberRaw = typeof record["turn_number"] === "number" && Number.isFinite(record["turn_number"])
        ? record["turn_number"]
        : 0;
    return {
        channel: typeof record["channel"] === "string"
            ? record["channel"]
            : fallbackChannel,
        from_agent: typeof record["from_agent"] === "string" && record["from_agent"].trim().length > 0
            ? record["from_agent"]
            : "unknown",
        ...(typeof record["to_agent"] === "string" && record["to_agent"].trim().length > 0
            ? { to_agent: record["to_agent"] }
            : {}),
        ...(record["visibility"] === "public" || record["visibility"] === "direct"
            ? { visibility: record["visibility"] }
            : {}),
        turn_number: Math.max(0, Math.floor(turnNumberRaw)),
        timestamp,
        message_type: safeMessageType(record["message_type"]),
        content: {
            text,
        },
    };
}
async function readChannelEntries(baseDir, team, channelName) {
    const channelState = team.channels[channelName];
    if (!channelState) {
        return [];
    }
    const channelPath = resolveChannelPath(baseDir, channelState.path);
    let raw = "";
    try {
        raw = await fs.readFile(channelPath, "utf-8");
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => parseMessageLine(line, channelName))
        .filter((entry) => Boolean(entry))
        .map((entry) => ({
        channelName,
        message: entry,
    }));
}
function sortChannels(channelNames) {
    return [...channelNames].sort((left, right) => {
        const leftDirect = left.startsWith(DM_CHANNEL_PREFIX);
        const rightDirect = right.startsWith(DM_CHANNEL_PREFIX);
        if (leftDirect !== rightDirect) {
            return leftDirect ? 1 : -1;
        }
        return left.localeCompare(right);
    });
}
function feedEntryColor(entry) {
    if (entry.message.visibility === "direct" || entry.channelName.startsWith(DM_CHANNEL_PREFIX)) {
        return Colors.AccentYellow;
    }
    if (entry.message.from_agent === "orchestrator") {
        return Colors.AccentCyan;
    }
    if (entry.message.from_agent === "user") {
        return Colors.AccentPurple;
    }
    switch (entry.message.message_type) {
        case "result":
            return Colors.AccentGreen;
        case "clarification":
            return Colors.AccentRed;
        case "instruction":
            return Colors.AccentBlue;
        case "question":
            return Colors.AccentYellow;
        case "task_update":
            return Colors.LightBlue;
        case "dm":
            return Colors.AccentYellow;
        default:
            return Colors.Foreground;
    }
}
function formatFeedScope(scope) {
    switch (scope) {
        case "selected_channel":
            return "selected channel";
        case "all_channels":
            return "all channels";
        case "inbox":
            return "participant inbox";
    }
}
function formatComposeMode(mode) {
    switch (mode) {
        case "public":
            return "Public Chat";
        case "dm":
            return "Direct DM";
        case "prompt":
            return "Orchestrator Prompt";
    }
}
export function TeamRuntimeDialog({ baseDir, onExit, onSubmitCommand, }) {
    const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
    const [focusSection, setFocusSection] = useState("teams");
    const [teamStates, setTeamStates] = useState([]);
    const [orchestratorStatus, setOrchestratorStatus] = useState(null);
    const [selectedTeamId, setSelectedTeamId] = useState(null);
    const [selectedChannelName, setSelectedChannelName] = useState(null);
    const [feedScope, setFeedScope] = useState("selected_channel");
    const [inboxParticipant, setInboxParticipant] = useState("user");
    const [feedEntries, setFeedEntries] = useState([]);
    const [feedOffset, setFeedOffset] = useState(0);
    const [selectedAction, setSelectedAction] = useState("refresh");
    const [composeMode, setComposeMode] = useState("public");
    const [composeFrom, setComposeFrom] = useState("user");
    const [composeTo, setComposeTo] = useState("orchestrator");
    const [composeChannel, setComposeChannel] = useState("#general");
    const [composeDraft, setComposeDraft] = useState("");
    const [selectedMetaField, setSelectedMetaField] = useState("mode");
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRunningAction, setIsRunningAction] = useState(false);
    const selectedTeam = useMemo(() => teamStates.find((team) => team.team_id === selectedTeamId) ?? null, [teamStates, selectedTeamId]);
    const sortedChannelNames = useMemo(() => sortChannels(Object.keys(selectedTeam?.channels ?? {})), [selectedTeam]);
    const publicChannelNames = useMemo(() => sortedChannelNames.filter((channelName) => isPublicChannel(channelName)), [sortedChannelNames]);
    const defaultPublicChannel = useMemo(() => {
        if (!selectedTeam) {
            return "#general";
        }
        if (selectedTeam.channels["#public"]) {
            return "#public";
        }
        if (selectedTeam.channels["#general"]) {
            return "#general";
        }
        return publicChannelNames[0] ?? sortedChannelNames[0] ?? "#general";
    }, [publicChannelNames, selectedTeam, sortedChannelNames]);
    const participantIds = useMemo(() => {
        const unique = new Set(["user", "orchestrator"]);
        for (const agent of selectedTeam?.manifest.agents ?? []) {
            unique.add(agent.id);
        }
        return Array.from(unique);
    }, [selectedTeam]);
    const dmTargetOptions = useMemo(() => participantIds.filter((participant) => participant !== composeFrom), [composeFrom, participantIds]);
    const teamItems = useMemo(() => teamStates.map((team) => {
        const phase = team.coordination?.phase ?? "planning";
        return {
            value: team.team_id,
            label: `${team.team_id} [${team.status}] phase=${phase} agents=${Object.keys(team.agents).length}`,
        };
    }), [teamStates]);
    const selectedTeamIndex = useMemo(() => {
        if (!selectedTeamId) {
            return 0;
        }
        const index = teamItems.findIndex((item) => item.value === selectedTeamId);
        return index >= 0 ? index : 0;
    }, [selectedTeamId, teamItems]);
    const channelItems = useMemo(() => sortedChannelNames.map((channelName) => {
        const channelState = selectedTeam?.channels[channelName];
        const participants = parseDmParticipants(channelName);
        const kind = participants ? "direct" : "public";
        const participantsLabel = participants
            ? ` ${participants[0]}<->${participants[1]}`
            : "";
        return {
            value: channelName,
            label: `${channelName} (${kind}) msgs=${channelState?.message_count ?? 0}${participantsLabel}`,
        };
    }), [selectedTeam, sortedChannelNames]);
    const selectedChannelIndex = useMemo(() => {
        if (!selectedChannelName) {
            return 0;
        }
        const index = channelItems.findIndex((item) => item.value === selectedChannelName);
        return index >= 0 ? index : 0;
    }, [selectedChannelName, channelItems]);
    const actionItems = useMemo(() => [
        { value: "refresh", label: "Refresh runtime state" },
        {
            value: "team_run",
            label: `Run selected team: ${selectedTeam?.team_id ?? "(select team)"}`,
        },
        {
            value: "team_status",
            label: `Team status: ${selectedTeam?.team_id ?? "(select team)"}`,
        },
        {
            value: "team_channels",
            label: `Team channels: ${selectedTeam?.team_id ?? "(select team)"}`,
        },
        { value: "orchestrator_status", label: "Orchestrator status" },
        { value: "orchestrator_start", label: "Start orchestrator daemon" },
        { value: "orchestrator_stop", label: "Stop orchestrator daemon" },
    ], [selectedTeam?.team_id]);
    const selectedActionIndex = useMemo(() => {
        const index = actionItems.findIndex((item) => item.value === selectedAction);
        return index >= 0 ? index : 0;
    }, [actionItems, selectedAction]);
    const composeMetaItems = useMemo(() => {
        const items = [
            {
                value: "mode",
                label: `Mode: ${formatComposeMode(composeMode)}`,
            },
            {
                value: "from",
                label: `From: ${composeFrom}`,
            },
        ];
        if (composeMode === "dm") {
            items.push({
                value: "to",
                label: `To: ${composeTo || "(choose participant)"}`,
            });
        }
        if (composeMode === "public") {
            items.push({
                value: "channel",
                label: `Channel: ${composeChannel}`,
            });
        }
        items.push({
            value: "feed_scope",
            label: `Feed Scope: ${formatFeedScope(feedScope)}`,
        });
        if (feedScope === "inbox") {
            items.push({
                value: "inbox",
                label: `Inbox: ${inboxParticipant}`,
            });
        }
        return items;
    }, [composeChannel, composeFrom, composeMode, composeTo, feedScope, inboxParticipant]);
    const selectedMetaIndex = useMemo(() => {
        const index = composeMetaItems.findIndex((item) => item.value === selectedMetaField);
        return index >= 0 ? index : 0;
    }, [composeMetaItems, selectedMetaField]);
    const resolveFeedChannelNames = useCallback(() => {
        if (!selectedTeam) {
            return [];
        }
        if (feedScope === "selected_channel") {
            if (selectedChannelName && selectedTeam.channels[selectedChannelName]) {
                return [selectedChannelName];
            }
            if (defaultPublicChannel && selectedTeam.channels[defaultPublicChannel]) {
                return [defaultPublicChannel];
            }
            return sortedChannelNames.slice(0, 1);
        }
        if (feedScope === "all_channels") {
            return sortedChannelNames;
        }
        return sortedChannelNames.filter((channelName) => {
            if (isPublicChannel(channelName)) {
                return true;
            }
            const participants = parseDmParticipants(channelName);
            return participants?.includes(inboxParticipant) ?? false;
        });
    }, [
        defaultPublicChannel,
        feedScope,
        inboxParticipant,
        selectedChannelName,
        selectedTeam,
        sortedChannelNames,
    ]);
    const reloadRuntimeState = useCallback(async (options) => {
        if (!options?.background) {
            setIsLoading(true);
        }
        setIsRefreshing(true);
        setErrorMessage(null);
        try {
            const [teams, orchestrator] = await Promise.all([
                listTeamStates(baseDir, { limit: 100 }),
                getOrchestratorStatus(),
            ]);
            const orderedTeams = [...teams].sort((left, right) => left.team_id.localeCompare(right.team_id));
            setTeamStates(orderedTeams);
            setOrchestratorStatus(orchestrator);
            setSelectedTeamId((current) => {
                if (current && orderedTeams.some((team) => team.team_id === current)) {
                    return current;
                }
                return orderedTeams[0]?.team_id ?? null;
            });
            if (options?.status) {
                setStatusMessage(options.status);
            }
        }
        catch (error) {
            setErrorMessage(`Failed to refresh runtime state: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            if (!options?.background) {
                setIsLoading(false);
            }
            setIsRefreshing(false);
        }
    }, [baseDir]);
    const reloadFeed = useCallback(async () => {
        if (!selectedTeam) {
            setFeedEntries([]);
            setFeedOffset(0);
            return;
        }
        try {
            const channelNames = resolveFeedChannelNames();
            const uniqueChannelNames = Array.from(new Set(channelNames)).filter((channelName) => selectedTeam.channels[channelName]);
            if (uniqueChannelNames.length === 0) {
                setFeedEntries([]);
                setFeedOffset(0);
                return;
            }
            const loaded = await Promise.all(uniqueChannelNames.map((channelName) => readChannelEntries(baseDir, selectedTeam, channelName)));
            const flattened = loaded
                .flat()
                .sort((left, right) => {
                const leftTime = Date.parse(left.message.timestamp);
                const rightTime = Date.parse(right.message.timestamp);
                const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
                const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
                if (safeLeft !== safeRight) {
                    return safeLeft - safeRight;
                }
                return left.message.turn_number - right.message.turn_number;
            })
                .slice(-500);
            setFeedEntries(flattened);
        }
        catch (error) {
            setErrorMessage(`Failed to load team feed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [baseDir, resolveFeedChannelNames, selectedTeam]);
    useEffect(() => {
        void reloadRuntimeState();
    }, [reloadRuntimeState]);
    useEffect(() => {
        void reloadFeed();
    }, [reloadFeed]);
    useEffect(() => {
        const timer = setInterval(() => {
            void reloadRuntimeState({ background: true });
            void reloadFeed();
        }, 3000);
        return () => {
            clearInterval(timer);
        };
    }, [reloadFeed, reloadRuntimeState]);
    useEffect(() => {
        if (sortedChannelNames.length === 0) {
            setSelectedChannelName(null);
            return;
        }
        if (selectedChannelName && sortedChannelNames.includes(selectedChannelName)) {
            return;
        }
        if (sortedChannelNames.includes(defaultPublicChannel)) {
            setSelectedChannelName(defaultPublicChannel);
            return;
        }
        setSelectedChannelName(sortedChannelNames[0]);
    }, [defaultPublicChannel, selectedChannelName, sortedChannelNames]);
    useEffect(() => {
        if (participantIds.length === 0) {
            setComposeFrom("user");
            setComposeTo("orchestrator");
            setInboxParticipant("user");
            return;
        }
        if (!participantIds.includes(composeFrom)) {
            setComposeFrom(participantIds[0]);
        }
        if (!participantIds.includes(inboxParticipant)) {
            setInboxParticipant(participantIds[0]);
        }
    }, [composeFrom, inboxParticipant, participantIds]);
    useEffect(() => {
        const allowedTargets = participantIds.filter((participant) => participant !== composeFrom);
        if (allowedTargets.length === 0) {
            setComposeTo(composeFrom);
            return;
        }
        if (!allowedTargets.includes(composeTo)) {
            setComposeTo(allowedTargets[0]);
        }
    }, [composeFrom, composeTo, participantIds]);
    useEffect(() => {
        const nextDefault = publicChannelNames[0] ?? defaultPublicChannel;
        if (!nextDefault) {
            return;
        }
        if (!publicChannelNames.includes(composeChannel) && composeChannel !== nextDefault) {
            setComposeChannel(nextDefault);
        }
    }, [composeChannel, defaultPublicChannel, publicChannelNames]);
    useEffect(() => {
        if (composeMetaItems.some((item) => item.value === selectedMetaField)) {
            return;
        }
        setSelectedMetaField(composeMetaItems[0]?.value ?? "mode");
    }, [composeMetaItems, selectedMetaField]);
    const executeSlashCommand = useCallback(async (command, successMessage) => {
        setIsRunningAction(true);
        setErrorMessage(null);
        try {
            const result = await onSubmitCommand(command);
            if (result?.messageType === "info" && result.content.trim().length > 0) {
                setStatusMessage(result.content);
            }
            else {
                setStatusMessage(successMessage);
            }
            await reloadRuntimeState({ background: true });
            await reloadFeed();
        }
        catch (error) {
            setErrorMessage(`Failed to execute command: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsRunningAction(false);
        }
    }, [onSubmitCommand, reloadFeed, reloadRuntimeState]);
    const runAction = useCallback(async (action) => {
        if (isRunningAction) {
            return;
        }
        setSelectedAction(action);
        if (action === "refresh") {
            await reloadRuntimeState({ status: "Runtime state refreshed." });
            await reloadFeed();
            return;
        }
        if (!selectedTeam && (action === "team_run" || action === "team_status" || action === "team_channels")) {
            setErrorMessage("Select a team first.");
            return;
        }
        switch (action) {
            case "team_run": {
                await executeSlashCommand(`/team run ${quoteForShell(selectedTeam.team_id)}`, `Submitted: /team run ${selectedTeam.team_id}`);
                return;
            }
            case "team_status": {
                await executeSlashCommand(`/team status ${quoteForShell(selectedTeam.team_id)}`, `Submitted: /team status ${selectedTeam.team_id}`);
                return;
            }
            case "team_channels": {
                await executeSlashCommand(`/team channels ${quoteForShell(selectedTeam.team_id)}`, `Submitted: /team channels ${selectedTeam.team_id}`);
                return;
            }
            case "orchestrator_status": {
                await executeSlashCommand("/orchestrator status", "Submitted: /orchestrator status");
                return;
            }
            case "orchestrator_start": {
                await executeSlashCommand("/orchestrator start", "Submitted: /orchestrator start");
                return;
            }
            case "orchestrator_stop": {
                await executeSlashCommand("/orchestrator stop", "Submitted: /orchestrator stop");
                return;
            }
            default:
                return;
        }
    }, [executeSlashCommand, isRunningAction, reloadFeed, reloadRuntimeState, selectedTeam]);
    const cycleMetaField = useCallback((field, direction = 1) => {
        setErrorMessage(null);
        if (field === "mode") {
            setComposeMode((current) => cycleValue(COMPOSE_MODES, current, direction));
            return;
        }
        if (field === "from") {
            if (participantIds.length === 0) {
                return;
            }
            setComposeFrom((current) => cycleValue(participantIds, current, direction));
            return;
        }
        if (field === "to") {
            if (dmTargetOptions.length === 0) {
                return;
            }
            setComposeTo((current) => cycleValue(dmTargetOptions, current, direction));
            return;
        }
        if (field === "channel") {
            const channels = publicChannelNames.length > 0 ? publicChannelNames : [defaultPublicChannel];
            setComposeChannel((current) => cycleValue(channels, current, direction));
            return;
        }
        if (field === "feed_scope") {
            setFeedScope((current) => cycleValue(FEED_SCOPES, current, direction));
            setFeedOffset(0);
            return;
        }
        if (participantIds.length === 0) {
            return;
        }
        setInboxParticipant((current) => cycleValue(participantIds, current, direction));
        setFeedOffset(0);
    }, [defaultPublicChannel, dmTargetOptions, participantIds, publicChannelNames]);
    const composeCommandPreview = useMemo(() => {
        if (!selectedTeam) {
            return "Select a team to compose messages.";
        }
        const message = composeDraft.trim();
        if (!message) {
            return "Type a message in the input pane below.";
        }
        if (composeMode === "prompt") {
            return `/team prompt ${quoteForShell(selectedTeam.team_id)} ${quoteForShell(message)}`;
        }
        if (composeMode === "dm") {
            if (!composeTo || composeTo === composeFrom) {
                return "Select a DM recipient different from sender.";
            }
            return (`/team dm ${quoteForShell(selectedTeam.team_id)}` +
                ` --from ${quoteForShell(composeFrom)}` +
                ` --to ${quoteForShell(composeTo)}` +
                ` --content ${quoteForShell(message)}`);
        }
        const channel = normalizeChannelName(composeChannel || defaultPublicChannel);
        return (`/team message ${quoteForShell(selectedTeam.team_id)}` +
            ` --from ${quoteForShell(composeFrom)}` +
            ` --channel ${quoteForShell(channel)}` +
            ` --content ${quoteForShell(message)}`);
    }, [
        composeChannel,
        composeDraft,
        composeFrom,
        composeMode,
        composeTo,
        defaultPublicChannel,
        selectedTeam,
    ]);
    const handleComposeSubmit = useCallback(async () => {
        if (!selectedTeam) {
            setErrorMessage("Select a team before sending messages.");
            return;
        }
        const message = composeDraft.trim();
        if (!message) {
            setErrorMessage("Compose message text is required.");
            return;
        }
        if (composeMode === "prompt") {
            await executeSlashCommand(`/team prompt ${quoteForShell(selectedTeam.team_id)} ${quoteForShell(message)}`, `Submitted prompt to team ${selectedTeam.team_id}.`);
            setComposeDraft("");
            return;
        }
        if (composeMode === "dm") {
            if (!composeTo || composeTo === composeFrom) {
                setErrorMessage("DM recipient must be different from sender.");
                return;
            }
            await executeSlashCommand(`/team dm ${quoteForShell(selectedTeam.team_id)}` +
                ` --from ${quoteForShell(composeFrom)}` +
                ` --to ${quoteForShell(composeTo)}` +
                ` --content ${quoteForShell(message)}`, `Sent DM ${composeFrom} -> ${composeTo} on ${selectedTeam.team_id}.`);
            setComposeDraft("");
            return;
        }
        const channel = normalizeChannelName(composeChannel || defaultPublicChannel);
        await executeSlashCommand(`/team message ${quoteForShell(selectedTeam.team_id)}` +
            ` --from ${quoteForShell(composeFrom)}` +
            ` --channel ${quoteForShell(channel)}` +
            ` --content ${quoteForShell(message)}`, `Posted message to ${channel} on ${selectedTeam.team_id}.`);
        setComposeDraft("");
    }, [
        composeChannel,
        composeDraft,
        composeFrom,
        composeMode,
        composeTo,
        defaultPublicChannel,
        executeSlashCommand,
        selectedTeam,
    ]);
    useKeypress((key) => {
        if (key.name === "escape") {
            onExit();
            return;
        }
        if (key.name === "tab") {
            setFocusSection((current) => {
                const index = FOCUS_ORDER.indexOf(current);
                const nextIndex = key.shift
                    ? (index - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length
                    : (index + 1) % FOCUS_ORDER.length;
                return FOCUS_ORDER[nextIndex];
            });
            return;
        }
        if (key.name === "r" && !key.ctrl && !key.meta) {
            void runAction("refresh");
            return;
        }
        if (!key.ctrl && !key.meta && key.sequence >= "1" && key.sequence <= "6") {
            const numeric = Number.parseInt(key.sequence, 10);
            const mapped = FOCUS_ORDER[numeric - 1];
            if (mapped) {
                setFocusSection(mapped);
            }
            return;
        }
        if (focusSection === "feed") {
            const maxOffset = Math.max(0, feedEntries.length - 1);
            if (key.name === "up" || key.name === "k") {
                setFeedOffset((current) => Math.min(maxOffset, current + 1));
                return;
            }
            if (key.name === "down" || key.name === "j") {
                setFeedOffset((current) => Math.max(0, current - 1));
                return;
            }
        }
        if (focusSection === "compose_meta") {
            const currentField = composeMetaItems[selectedMetaIndex]?.value;
            if (!currentField) {
                return;
            }
            if (key.name === "left" || key.name === "h") {
                cycleMetaField(currentField, -1);
                return;
            }
            if (key.name === "right" || key.name === "l") {
                cycleMetaField(currentField, 1);
            }
        }
    }, { isActive: true });
    const feedMaxItems = Math.max(10, Math.min(30, Math.floor(terminalRows * 0.45)));
    const maxFeedOffset = Math.max(0, feedEntries.length - feedMaxItems);
    const normalizedFeedOffset = Math.max(0, Math.min(feedOffset, maxFeedOffset));
    const feedEnd = feedEntries.length - normalizedFeedOffset;
    const feedStart = Math.max(0, feedEnd - feedMaxItems);
    const visibleFeedEntries = feedEntries.slice(feedStart, feedEnd);
    useEffect(() => {
        setFeedOffset((current) => Math.min(current, maxFeedOffset));
    }, [maxFeedOffset]);
    const totalWidth = Math.max(92, terminalColumns - 2);
    const teamsWidth = Math.max(24, Math.floor(totalWidth * 0.26));
    const sideWidth = Math.max(30, Math.floor(totalWidth * 0.3));
    const feedWidth = Math.max(34, totalWidth - teamsWidth - sideWidth - 2);
    const composeMetaWidth = Math.max(36, Math.floor(totalWidth * 0.38));
    const composeInputWidth = Math.max(36, totalWidth - composeMetaWidth - 1);
    const listMaxItems = Math.max(6, Math.min(12, Math.floor(terminalRows * 0.24)));
    const actionMaxItems = Math.max(5, Math.min(9, Math.floor(terminalRows * 0.22)));
    const composeInputHeight = Math.max(3, Math.min(5, Math.floor(terminalRows * 0.12)));
    const teamPhase = selectedTeam?.coordination?.phase ?? "planning";
    const turnNumber = selectedTeam?.coordination?.turn_number ?? 0;
    const waitingCount = selectedTeam?.coordination?.waiting_on_agent_ids.length ?? 0;
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", width: "100%", padding: 1, gap: 1, children: [_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: Colors.AccentCyan, children: "Team Runtime Console" }), _jsx(Text, { color: Colors.Gray, children: "Live team operations with channels, DMs, orchestration controls, and in-console messaging." })] }), _jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: orchestratorStatus?.running ? Colors.AccentGreen : Colors.AccentRed, wrap: "truncate", children: ["Orchestrator: ", orchestratorStatus?.running ? "RUNNING" : "STOPPED", orchestratorStatus?.running && orchestratorStatus.pid
                                ? ` (pid ${orchestratorStatus.pid})`
                                : "", orchestratorStatus?.last_tick
                                ? ` | last tick ${formatTimestamp(orchestratorStatus.last_tick)}`
                                : ""] }), _jsxs(Text, { color: Colors.Gray, wrap: "truncate", children: ["Decision Mode: ", orchestratorStatus?.decision_mode ?? "unknown", " (", orchestratorStatus?.decision_mode_source ?? "unknown", ") | Planner: ", orchestratorStatus?.planner_source ?? "n/a", "| Confidence:", " ", typeof orchestratorStatus?.planner_last_confidence === "number"
                                ? orchestratorStatus.planner_last_confidence.toFixed(2)
                                : "n/a"] }), _jsxs(Text, { color: Colors.Gray, wrap: "truncate", children: ["Team: ", selectedTeam?.team_id ?? "(none)", " [", selectedTeam?.status ?? "n/a", "] phase=", teamPhase, " turn=", turnNumber, " waiting=", waitingCount, "| Delegations dispatched/completed/failed: ", orchestratorStatus?.team_delegations_dispatched ?? 0, "/", orchestratorStatus?.team_delegations_completed ?? 0, "/", orchestratorStatus?.team_delegations_failed ?? 0] })] }), _jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: teamsWidth, borderStyle: "single", borderColor: focusSection === "teams" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "teams", children: [focusSection === "teams" ? "> " : "  ", "Teams"] }), isLoading ? (_jsx(Text, { color: Colors.Gray, children: "Loading teams..." })) : teamItems.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No teams found." })) : (_jsx(RadioButtonSelect, { items: teamItems, initialIndex: selectedTeamIndex, onHighlight: (value) => {
                                    setSelectedTeamId(value);
                                    setFeedOffset(0);
                                }, onSelect: (value) => {
                                    setSelectedTeamId(value);
                                    setFeedOffset(0);
                                }, isFocused: focusSection === "teams", maxItemsToShow: listMaxItems, showScrollArrows: true }))] }), _jsxs(Box, { flexDirection: "column", width: sideWidth, gap: 1, children: [_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: focusSection === "channels" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "channels", children: [focusSection === "channels" ? "> " : "  ", "Channels (", channelItems.length, ")"] }), selectedTeam ? (channelItems.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No channels in this team." })) : (_jsx(RadioButtonSelect, { items: channelItems, initialIndex: selectedChannelIndex, onHighlight: (value) => {
                                            setSelectedChannelName(value);
                                            setFeedScope("selected_channel");
                                            setFeedOffset(0);
                                        }, onSelect: (value) => {
                                            setSelectedChannelName(value);
                                            setFeedScope("selected_channel");
                                            setFeedOffset(0);
                                        }, isFocused: focusSection === "channels", maxItemsToShow: Math.max(4, listMaxItems - 2), showScrollArrows: true }))) : (_jsx(Text, { color: Colors.Gray, children: "Select a team first." }))] }), _jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: focusSection === "actions" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "actions", children: [focusSection === "actions" ? "> " : "  ", "Actions"] }), _jsx(RadioButtonSelect, { items: actionItems, initialIndex: selectedActionIndex, onHighlight: (value) => setSelectedAction(value), onSelect: (value) => {
                                            void runAction(value);
                                        }, isFocused: focusSection === "actions", maxItemsToShow: actionMaxItems, showScrollArrows: true })] })] }), _jsxs(Box, { flexDirection: "column", width: feedWidth, borderStyle: "single", borderColor: focusSection === "feed" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "feed", children: [focusSection === "feed" ? "> " : "  ", "Activity Feed (", formatFeedScope(feedScope), ")"] }), _jsxs(Text, { color: Colors.Gray, wrap: "truncate", children: ["Channels: ", resolveFeedChannelNames().join(", ") || "(none)"] }), _jsxs(Text, { color: Colors.Gray, children: ["Messages: ", feedEntries.length, " | Scroll: ", normalizedFeedOffset, "/", maxFeedOffset] }), visibleFeedEntries.length === 0 ? (_jsx(Text, { color: Colors.Gray, children: "No messages for the current feed selection." })) : (visibleFeedEntries.map((entry, index) => {
                                const toSuffix = entry.message.to_agent
                                    ? ` -> ${entry.message.to_agent}`
                                    : "";
                                return (_jsxs(Text, { color: feedEntryColor(entry), wrap: "truncate", children: ["[", formatTime(entry.message.timestamp), "] ", entry.channelName, " ", entry.message.from_agent, toSuffix, ": ", formatPreview(entry.message.content.text, Math.max(48, Math.floor(feedWidth * 0.72)))] }, `${entry.channelName}-${entry.message.turn_number}-${feedStart + index}`));
                            }))] })] }), _jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: composeMetaWidth, borderStyle: "single", borderColor: focusSection === "compose_meta" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "compose_meta", children: [focusSection === "compose_meta" ? "> " : "  ", "Compose Controls"] }), _jsx(RadioButtonSelect, { items: composeMetaItems, initialIndex: selectedMetaIndex, onHighlight: (value) => setSelectedMetaField(value), onSelect: (value) => cycleMetaField(value), isFocused: focusSection === "compose_meta", maxItemsToShow: Math.max(4, composeMetaItems.length), showScrollArrows: false }), _jsx(Text, { color: Colors.Gray, wrap: "truncate", children: "Press Enter to cycle selected field value. Left/Right also cycle." })] }), _jsxs(Box, { flexDirection: "column", width: composeInputWidth, borderStyle: "single", borderColor: focusSection === "compose_input" ? Colors.AccentGreen : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "compose_input", children: [focusSection === "compose_input" ? "> " : "  ", "Compose Message"] }), _jsx(TextInput, { value: composeDraft, onChange: (value) => {
                                    setComposeDraft(value);
                                    setErrorMessage(null);
                                }, onSubmit: () => {
                                    void handleComposeSubmit();
                                }, placeholder: composeMode === "prompt"
                                    ? "Instruction to orchestrator for selected team"
                                    : composeMode === "dm"
                                        ? "Direct message content"
                                        : "Public channel message", inputWidth: Math.max(28, composeInputWidth - 8), height: composeInputHeight, isActive: focusSection === "compose_input" }), _jsxs(Text, { color: Colors.Gray, wrap: "truncate", children: ["Preview: ", formatPreview(composeCommandPreview, Math.max(42, composeInputWidth - 10))] })] })] }), statusMessage && _jsx(Text, { color: Colors.AccentGreen, children: statusMessage }), errorMessage && _jsx(Text, { color: Colors.AccentRed, children: errorMessage }), (isRefreshing || isRunningAction) && (_jsx(Text, { color: Colors.Gray, children: "Updating runtime view..." })), _jsxs(Text, { color: Colors.Gray, children: ["Focus: ", focusSection, " | `1-6` jump panes | Tab/Shift+Tab cycle | Enter acts on selected item | r refresh | Esc close"] })] }));
}
//# sourceMappingURL=TeamRuntimeDialog.js.map