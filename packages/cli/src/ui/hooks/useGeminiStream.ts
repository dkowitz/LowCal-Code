/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type {
  Config,
  GeminiClient,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  ServerGeminiChatCompressedEvent,
  ServerGeminiFinishedEvent,
  ToolCallRequestInfo,
  EditorType,
  ThoughtSummary,
  CheckpointMessage,
  CheckpointContextSnapshot,
  CheckpointToolCall,
  CheckpointSessionMeta,
} from "@qwen-code/qwen-code-core";
import {
  GeminiEventType as ServerGeminiEventType,
  getErrorMessage,
  isNodeError,
  MessageSenderType,
  logUserPrompt,
  GitService,
  UnauthorizedError,
  UserPromptEvent,
  DEFAULT_GEMINI_FLASH_MODEL,
  logConversationFinishedEvent,
  ConversationFinishedEvent,
  ApprovalMode,
  parseAndFormatApiError,
  CheckpointService,
  upsertLaunchTaskState,
  toolConfig,
} from "@qwen-code/qwen-code-core";
import {
  type Content,
  type Part,
  type PartListUnion,
  FinishReason,
} from "@google/genai";
import type {
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  SlashCommandProcessorResult,
} from "../types.js";
import { StreamingState, MessageType, ToolCallStatus } from "../types.js";
import { isAtCommand, isSlashCommand } from "../utils/commandUtils.js";
import { injectCollabContextForTurn } from "../utils/collabContext.js";
import { useShellCommandProcessor } from "./shellCommandProcessor.js";
import { useVisionAutoSwitch } from "./useVisionAutoSwitch.js";
import { handleAtCommand } from "./atCommandProcessor.js";
import { findLastSafeSplitPoint } from "../utils/markdownUtilities.js";
import { useStateAndRef } from "./useStateAndRef.js";
import type { UseHistoryManagerReturn } from "./useHistoryManager.js";
import { useLogger } from "./useLogger.js";
import type {
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from "./useReactToolScheduler.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
} from "./useReactToolScheduler.js";
import { useSessionStats } from "../contexts/SessionContext.js";
import { formatDuration } from "../utils/formatters.js";
import { useKeypress } from "./useKeypress.js";
import {
  setSessionControlHandlers,
  type SessionEnqueueTaskPayload,
  setSessionStatus,
  updateSessionDetails,
  setRegisteredSessionHealth,
} from "../../session/sessionManager.js";
import { normalizeAuthType } from "../../config/auth.js";

const ENV_TASK_SYSTEM_PROMPT_B64 = "LOWCAL_TASK_SYSTEM_PROMPT_B64";

const formatElapsed = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }
  return formatDuration(milliseconds);
};

const normalizeForSimilarity = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractHistoryMessageText = (message: unknown): string => {
  if (typeof message === "string") {
    return message;
  }

  if (typeof message !== "object" || message === null) {
    return "";
  }

  const messageRecord = message as Record<string, unknown>;
  const contentValue = messageRecord["content"];
  if (typeof contentValue === "string") {
    return contentValue;
  }

  const textValue = messageRecord["text"];
  if (typeof textValue === "string") {
    return textValue;
  }

  const partsValue = messageRecord["parts"];
  if (!Array.isArray(partsValue) || partsValue.length === 0) {
    return "";
  }

  const firstPart = partsValue[0];
  if (typeof firstPart !== "object" || firstPart === null) {
    return "";
  }

  const firstPartText = (firstPart as Record<string, unknown>)["text"];
  return typeof firstPartText === "string" ? firstPartText : "";
};

const LOOP_RECOVERY_PROMPT =
  "Loop detected. Do not repeat the same actions. Summarize what was already tried and why it did not work, then choose a materially different next step that gathers new evidence. Continue autonomously and only ask the user if you are blocked.";

const buildRecoveryContextSnippet = (
  messages: unknown[],
  maxItems = 3,
  maxChars = 300,
): string => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const recent = messages
    .slice(-maxItems)
    .map((message) => extractHistoryMessageText(message))
    .filter((text) => typeof text === "string" && text.trim().length > 0)
    .map((text) => text.trim())
    .join(" ... ");

  if (!recent) {
    return "";
  }

  return recent.length > maxChars ? `${recent.slice(0, maxChars)}...` : recent;
};

const MAX_SESSION_RECENT_HISTORY_ITEMS = 24;
const MAX_SESSION_HISTORY_ITEM_CHARS = 800;

type SessionHistoryRole = "system" | "user" | "assistant" | "tool" | "unknown";

function clipSessionHistoryText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_SESSION_HISTORY_ITEM_CHARS) {
    return compact;
  }
  return `${compact.slice(0, MAX_SESSION_HISTORY_ITEM_CHARS)}...`;
}

function toSessionHistoryItem(
  item: HistoryItem,
): { timestamp: string; role: SessionHistoryRole; content: string } | null {
  if (item.type === MessageType.USER || item.type === "user_shell") {
    return {
      timestamp: new Date(item.id).toISOString(),
      role: "user",
      content: clipSessionHistoryText(item.text),
    };
  }
  if (item.type === MessageType.GEMINI || item.type === "gemini_content") {
    return {
      timestamp: new Date(item.id).toISOString(),
      role: "assistant",
      content: clipSessionHistoryText(item.text),
    };
  }
  if (item.type === "tool_group") {
    const summary = item.tools
      .map((tool) => `${tool.name}:${tool.status}`)
      .join(", ");
    if (!summary) {
      return null;
    }
    return {
      timestamp: new Date(item.id).toISOString(),
      role: "tool",
      content: clipSessionHistoryText(`Tools: ${summary}`),
    };
  }
  if (item.type === MessageType.ERROR || item.type === MessageType.INFO) {
    return {
      timestamp: new Date(item.id).toISOString(),
      role: "unknown",
      content: clipSessionHistoryText(item.text),
    };
  }
  return null;
}

const isHighSimilarityRewrite = (current: string, incoming: string): boolean => {
  if (!current || !incoming) {
    return false;
  }
  if (current.length < 40 || incoming.length < 40) {
    return false;
  }
  if (
    incoming.startsWith(current) ||
    current.startsWith(incoming) ||
    incoming.includes(current) ||
    current.includes(incoming)
  ) {
    return false;
  }

  const normalizedCurrent = normalizeForSimilarity(current);
  const normalizedIncoming = normalizeForSimilarity(incoming);
  if (!normalizedCurrent || !normalizedIncoming) {
    return false;
  }

  const currentTokens = normalizedCurrent
    .split(" ")
    .filter((token) => token.length >= 3);
  const incomingTokens = normalizedIncoming
    .split(" ")
    .filter((token) => token.length >= 3);
  if (currentTokens.length < 6 || incomingTokens.length < 6) {
    return false;
  }

  const currentSet = new Set(currentTokens);
  const incomingSet = new Set(incomingTokens);
  let overlap = 0;
  for (const token of incomingSet) {
    if (currentSet.has(token)) {
      overlap++;
    }
  }

  const minSetSize = Math.min(currentSet.size, incomingSet.size);
  if (minSetSize === 0) {
    return false;
  }
  const overlapRatio = overlap / minSetSize;
  const lengthRatio = Math.max(current.length, incoming.length) /
    Math.min(current.length, incoming.length);

  return overlapRatio >= 0.75 && lengthRatio <= 1.5;
};

const getStreamDelta = (current: string, incoming: string): string | null => {
  if (!current) {
    return incoming;
  }

  if (
    incoming === current ||
    (incoming.trim() && incoming.trim() === current.trim()) ||
    current.startsWith(incoming)
  ) {
    return null;
  }

  if (incoming.startsWith(current)) {
    return incoming.slice(current.length);
  }

  const maxOverlap = Math.min(current.length, incoming.length);
  for (let length = maxOverlap; length > 0; length--) {
    if (current.endsWith(incoming.slice(0, length))) {
      return incoming.slice(length);
    }
  }

  return incoming;
};

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  geminiClient: GeminiClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn["addItem"],
  config: Config,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: PartListUnion,
  ) => Promise<SlashCommandProcessorResult | false>,
  shellModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  onAuthError: () => void,
  performMemoryRefresh: () => Promise<void>,
  modelSwitchedFromQuotaError: boolean,
  setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>,
  onEditorClose: () => void,
  onCancelSubmit: () => void,
  visionModelPreviewEnabled: boolean,
  onVisionSwitchRequired?: (query: PartListUnion) => Promise<{
    modelOverride?: string;
    persistSessionModel?: string;
    showGuidance?: boolean;
  }>,
  refreshProviderState?: () => Promise<void>,
) => {
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnCancelledRef = useRef(false);
  const isSubmittingQueryRef = useRef(false);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const processedMemoryToolsRef = useRef<Set<string>>(new Set());
  const turnStartTimestampRef = useRef<number | null>(null);
  const turnDurationLoggedRef = useRef<boolean>(false);
  const needsAntiRepeatHintRef = useRef<boolean>(false);
  const toolCallSignatureCountsRef = useRef<Map<string, number>>(new Map());
  const toolCallIdToSignatureRef = useRef<Map<string, string>>(new Map());
  const streamingStateRef = useRef<StreamingState>(StreamingState.Idle);
  const inProcessTaskQueueRef = useRef<SessionEnqueueTaskPayload[]>([]);
  const processingInProcessTaskRef = useRef<boolean>(false);
  const checkpointPendingForTurnRef = useRef(false);
  const checkpointTurnStartTimestampRef = useRef<number | null>(null);
  const { stats, startNewPrompt, getPromptCount } = useSessionStats();
  const storage = config.storage;
  const logger = useLogger(storage);
  const gitService = useMemo(() => {
    if (!config.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot(), storage);
  }, [config, storage]);

  const [toolCalls, scheduleToolCalls, coreMarkToolsAsSubmitted] =
    useReactToolScheduler(
      async (completedToolCallsFromScheduler) => {
        // This onComplete is called when ALL scheduled tools for a given batch are done.
        if (completedToolCallsFromScheduler.length > 0) {
          // Add the final state of these tools to the history for display.
          addItem(
            mapTrackedToolCallsToDisplay(
              completedToolCallsFromScheduler as TrackedToolCall[],
            ),
            Date.now(),
          );

          // Handle tool response submission immediately when tools complete
          await handleCompletedTools(
            completedToolCallsFromScheduler as TrackedToolCall[],
          );
        }
      },
      config,
      setPendingHistoryItem,
      getPreferredEditor,
      onEditorClose,
    );

  useEffect(() => {
    if (!config.getDebugMode()) {
      return;
    }
    const projectRoot = config.getProjectRoot();
    const checkpointPath = projectRoot
      ? path.join(projectRoot, ".lowcal", "checkpoints")
      : "(unknown project root)";
    onDebugMessage(
      `[Checkpoint] Auto turn checkpointing ${
        config.getCheckpointingEnabled() ? "ENABLED" : "DISABLED"
      } (${checkpointPath})`,
    );
  }, [config, onDebugMessage]);

  const releaseToolCallSignatures = useCallback((callIds: string[]) => {
    for (const id of callIds) {
      const signature = toolCallIdToSignatureRef.current.get(id);
      if (!signature) continue;
      const currentCount =
        toolCallSignatureCountsRef.current.get(signature) ?? 0;
      if (currentCount <= 1) {
        toolCallSignatureCountsRef.current.delete(signature);
      } else {
        toolCallSignatureCountsRef.current.set(signature, currentCount - 1);
      }
      toolCallIdToSignatureRef.current.delete(id);
    }
  }, []);

  const markToolsAsSubmitted = useCallback(
    (callIds: string[]) => {
      releaseToolCallSignatures(callIds);
      coreMarkToolsAsSubmitted(callIds);
    },
    [coreMarkToolsAsSubmitted, releaseToolCallSignatures],
  );

  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? mapTrackedToolCallsToDisplay(toolCalls) : undefined,
    [toolCalls],
  );

  const loopDetectedRef = useRef(false);
  const lastRestartableQueryRef = useRef<PartListUnion | null>(null);
  const recoveryRetryCountRef = useRef(0);
  const pendingSelfRecoveryPromptRef = useRef<string | null>(null);

  const onExec = useCallback(async (done: Promise<void>) => {
    setIsResponding(true);
    await done;
    setIsResponding(false);
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    geminiClient,
  );

  const { handleVisionSwitch, restoreOriginalModel } = useVisionAutoSwitch(
    config,
    addItem,
    visionModelPreviewEnabled,
    onVisionSwitchRequired,
  );

  const streamingState = useMemo(() => {
    if (toolCalls.some((tc) => tc.status === "awaiting_approval")) {
      return StreamingState.WaitingForConfirmation;
    }
    if (
      isResponding ||
      toolCalls.some(
        (tc) =>
          tc.status === "executing" ||
          tc.status === "scheduled" ||
          tc.status === "validating" ||
          ((tc.status === "success" ||
            tc.status === "error" ||
            tc.status === "cancelled") &&
            !(tc as TrackedCompletedToolCall | TrackedCancelledToolCall)
              .responseSubmittedToGemini),
      )
    ) {
      return StreamingState.Responding;
    }
    return StreamingState.Idle;
  }, [isResponding, toolCalls]);

  useEffect(() => {
    const status = streamingState === StreamingState.Idle ? "idle" : "working";
    void setSessionStatus(status);
  }, [streamingState]);

  useEffect(() => {
    const details: Record<string, unknown> = {
      model: config.getModel(),
      approval_mode: String(config.getApprovalMode()),
      phase: streamingState === StreamingState.Idle ? "idle" : "responding",
      active_tool_calls: toolCalls.filter(
        (toolCall) =>
          toolCall.status === "executing" ||
          toolCall.status === "scheduled" ||
          toolCall.status === "validating",
      ).length,
      last_prompt_tokens: stats.lastPromptTokenCount,
    };

    const authType = normalizeAuthType(config.getContentGeneratorConfig()?.authType);
    if (authType) {
      details["auth_type"] = authType;
    }

    if (
      typeof stats.currentContextTokenCount === "number" &&
      Number.isFinite(stats.currentContextTokenCount)
    ) {
      details["current_context_tokens"] = stats.currentContextTokenCount;
    }

    const sessionTokenLimit = config.getSessionTokenLimit();
    if (Number.isFinite(sessionTokenLimit) && sessionTokenLimit > 0) {
      details["session_token_limit"] = sessionTokenLimit;
      if (
        typeof stats.currentContextTokenCount === "number" &&
        Number.isFinite(stats.currentContextTokenCount)
      ) {
        details["token_budget"] = {
          current_tokens: stats.currentContextTokenCount,
          effective_limit: sessionTokenLimit,
          utilization_ratio: stats.currentContextTokenCount / sessionTokenLimit,
        };
      }
    }

    details["turn_started_at"] = turnStartTimestampRef.current
      ? new Date(turnStartTimestampRef.current).toISOString()
      : null;

    const recentHistory = history
      .map(toSessionHistoryItem)
      .filter(
        (
          item,
        ): item is { timestamp: string; role: SessionHistoryRole; content: string } =>
          item !== null,
      )
      .slice(-MAX_SESSION_RECENT_HISTORY_ITEMS);
    details["recent_history"] = recentHistory;

    void updateSessionDetails(details);
  }, [
    config,
    history,
    stats.currentContextTokenCount,
    stats.lastPromptTokenCount,
    streamingState,
    toolCalls,
  ]);

  useEffect(() => {
    streamingStateRef.current = streamingState;
  }, [streamingState]);

  useEffect(() => {
    if (
      config.getApprovalMode() === ApprovalMode.YOLO &&
      streamingState === StreamingState.Idle
    ) {
      const lastUserMessageIndex = history.findLastIndex(
        (item: HistoryItem) => item.type === MessageType.USER,
      );

      const turnCount =
        lastUserMessageIndex === -1 ? 0 : history.length - lastUserMessageIndex;

      if (turnCount > 0) {
        logConversationFinishedEvent(
          config,
          new ConversationFinishedEvent(config.getApprovalMode(), turnCount),
        );
      }
    }
  }, [streamingState, config, history]);

  const cancelOngoingRequest = useCallback(() => {
    if (streamingState !== StreamingState.Responding) {
      return;
    }
    if (turnCancelledRef.current) {
      return;
    }
    checkpointPendingForTurnRef.current = false;
    checkpointTurnStartTimestampRef.current = null;
    turnCancelledRef.current = true;
    isSubmittingQueryRef.current = false;
    abortControllerRef.current?.abort();
    if (pendingHistoryItemRef.current) {
      addItem(pendingHistoryItemRef.current, Date.now());
    }
    addItem(
      {
        type: MessageType.INFO,
        text: "Request cancelled.",
      },
      Date.now(),
    );
    setPendingHistoryItem(null);
    onCancelSubmit();
    setIsResponding(false);
  }, [
    streamingState,
    addItem,
    setPendingHistoryItem,
    onCancelSubmit,
    pendingHistoryItemRef,
  ]);

  useKeypress(
    (key) => {
      if (key.name === "escape") {
        cancelOngoingRequest();
      }
    },
    { isActive: streamingState === StreamingState.Responding },
  );

  const prepareQueryForGemini = useCallback(
    async (
      query: PartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
      prompt_id: string,
    ): Promise<{
      queryToSend: PartListUnion | null;
      shouldProceed: boolean;
    }> => {
      const applyAntiRepeatHint = (
        candidate: PartListUnion | null,
      ): PartListUnion | null => {
        if (!candidate || !needsAntiRepeatHintRef.current) {
          return candidate;
        }
        needsAntiRepeatHintRef.current = false;
        return appendAntiRepeatHint(candidate);
      };
      if (turnCancelledRef.current) {
        return { queryToSend: null, shouldProceed: false };
      }
      if (typeof query === "string" && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: PartListUnion | null = null;

      if (typeof query === "string") {
        const trimmedQuery = query.trim();
        logUserPrompt(
          config,
          new UserPromptEvent(
            trimmedQuery.length,
            prompt_id,
            config.getContentGeneratorConfig()?.authType,
            trimmedQuery,
          ),
        );
        onDebugMessage(`User query: '${trimmedQuery}'`);
        await logger?.logMessage(MessageSenderType.USER, trimmedQuery);

        // Handle UI-only commands first
        const slashCommandResult = isSlashCommand(trimmedQuery)
          ? await handleSlashCommand(trimmedQuery)
          : false;

        if (slashCommandResult) {
          switch (slashCommandResult.type) {
            case "schedule_tool": {
              const { toolName, toolArgs } = slashCommandResult;
              const toolCallRequest: ToolCallRequestInfo = {
                callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: toolName,
                args: toolArgs,
                isClientInitiated: true,
                prompt_id,
              };
              scheduleToolCalls([toolCallRequest], abortSignal);
              return { queryToSend: null, shouldProceed: false };
            }
            case "submit_prompt": {
              localQueryToSendToGemini = applyAntiRepeatHint(
                slashCommandResult.content,
              );

              return {
                queryToSend: localQueryToSendToGemini,
                shouldProceed: true,
              };
            }
            case "handled": {
              return { queryToSend: null, shouldProceed: false };
            }
            default: {
              const unreachable: never = slashCommandResult;
              throw new Error(
                `Unhandled slash command result type: ${unreachable}`,
              );
            }
          }
        }

        if (shellModeActive && handleShellCommand(trimmedQuery, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });

          // Add user's turn after @ command processing is done.
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );

          if (!atCommandResult.shouldProceed) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          "Query processing resulted in null, not sending to Gemini.",
        );
        return { queryToSend: null, shouldProceed: false };
      }
      return {
        queryToSend: applyAntiRepeatHint(localQueryToSendToGemini),
        shouldProceed: true,
      };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
    ],
  );

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent["value"],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      if (turnCancelledRef.current) {
        // Prevents additional output after a user initiated cancel.
        return "";
      }
      // Defensive normalization: handle providers that replay full/cumulative
      // text chunks instead of strict deltas.
      let normalizedDelta = eventValue;
      let shouldReplaceBuffer = false;
      if (currentGeminiMessageBuffer) {
        const mergedDelta = getStreamDelta(currentGeminiMessageBuffer, eventValue);
        if (mergedDelta === null) {
          return currentGeminiMessageBuffer;
        }
        normalizedDelta = mergedDelta;
        if (
          isHighSimilarityRewrite(currentGeminiMessageBuffer, eventValue)
        ) {
          shouldReplaceBuffer = true;
          normalizedDelta = eventValue;
        }
      }
      if (!normalizedDelta) {
        return currentGeminiMessageBuffer;
      }

      let newGeminiMessageBuffer = shouldReplaceBuffer
        ? normalizedDelta
        : currentGeminiMessageBuffer + normalizedDelta;
      if (
        pendingHistoryItemRef.current?.type !== "gemini" &&
        pendingHistoryItemRef.current?.type !== "gemini_content"
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: "gemini", text: "" });
        newGeminiMessageBuffer = normalizedDelta;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as "gemini" | "gemini_content",
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | "gemini"
              | "gemini_content",
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: "gemini_content", text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      checkpointPendingForTurnRef.current = false;
      checkpointTurnStartTimestampRef.current = null;
      if (turnCancelledRef.current) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === "tool_group") {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: "User cancelled the request." },
        userMessageTimestamp,
      );
      if (
        turnStartTimestampRef.current !== null &&
        !turnDurationLoggedRef.current
      ) {
        const durationMs = Date.now() - turnStartTimestampRef.current;
        if (durationMs >= 0) {
          addItem(
            {
              type: MessageType.INFO,
              text: `⏱ Turn cancelled after ${formatElapsed(durationMs)}`.trim(),
            },
            Date.now(),
          );
        }
        turnDurationLoggedRef.current = true;
        turnStartTimestampRef.current = null;
      }
      setIsResponding(false);
      setThought(null); // Reset thought when user cancels
    },
    [
      addItem,
      pendingHistoryItemRef,
      setPendingHistoryItem,
      setThought,
      turnStartTimestampRef,
      turnDurationLoggedRef,
    ],
  );

  const handleErrorEvent = useCallback(
    (eventValue: ErrorEvent["value"], userMessageTimestamp: number) => {
      checkpointPendingForTurnRef.current = false;
      checkpointTurnStartTimestampRef.current = null;
      const errorMessage = getErrorMessage(eventValue.error);

      // Signal the orchestrator that we've encountered an error
      setRegisteredSessionHealth({
        state: "error",
        reason: "unhandled_error",
        confidence: 0.9,
        evidence: {
          error_message: eventValue.error,
        },
      });
      void updateSessionDetails({
        last_error: errorMessage,
        last_error_at: new Date().toISOString(),
      });

      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      addItem(
        {
          type: MessageType.ERROR,
          text: parseAndFormatApiError(
            eventValue.error,
            config.getContentGeneratorConfig()?.authType,
            undefined,
            config.getModel(),
            DEFAULT_GEMINI_FLASH_MODEL,
          ),
        },
        userMessageTimestamp,
      );
      if (
        turnStartTimestampRef.current !== null &&
        !turnDurationLoggedRef.current
      ) {
        const durationMs = Date.now() - turnStartTimestampRef.current;
        if (durationMs >= 0) {
          addItem(
            {
              type: MessageType.INFO,
              text: `⏱ Turn errored after ${formatElapsed(durationMs)}`.trim(),
            },
            Date.now(),
          );
        }
        turnDurationLoggedRef.current = true;
        turnStartTimestampRef.current = null;
      }
      setThought(null); // Reset thought when there's an error

      // Trigger self-recovery for the error with context
      handleSelfRecovery("error", errorMessage);
    },
    [
      addItem,
      pendingHistoryItemRef,
      setPendingHistoryItem,
      config,
      setThought,
      turnStartTimestampRef,
      turnDurationLoggedRef,
      geminiClient,
    ],
  );

  const buildCheckpointMessages = useCallback(
    (historyItems: HistoryItem[]): CheckpointMessage[] => {
      const timestamp = new Date().toISOString();
      const checkpointMessages: CheckpointMessage[] = [];

      historyItems.forEach((item, index) => {
        if (item.type === MessageType.USER && item.text) {
          checkpointMessages.push({
            id: `msg-${Date.now()}-${index}`,
            timestamp,
            type: "user",
            content: item.text,
          });
          return;
        }

        if (
          (item.type === MessageType.GEMINI ||
            item.type === "gemini_content") &&
          item.text
        ) {
          checkpointMessages.push({
            id: `msg-${Date.now()}-${index}`,
            timestamp,
            type: "gemini",
            content: item.text,
          });
        }

        // Include tool calls from tool groups
        if (item.type === "tool_group" && item.tools) {
          const toolCalls = item.tools.map(
            (tool): CheckpointToolCall => ({
              id: tool.callId,
              name: tool.name,
              args: {}, // Args not available in IndividualToolCallDisplay - will be populated from client history
              result: (tool.resultDisplay as PartListUnion | null) ?? null,
            }),
          );

          // Add to the most recent gemini message if it exists
          const lastGeminiMsg = checkpointMessages
            .filter((m) => m.type === "gemini")
            .pop();
          if (lastGeminiMsg && !lastGeminiMsg.toolCalls) {
            lastGeminiMsg.toolCalls = toolCalls;
          } else if (!lastGeminiMsg) {
            // If no gemini message exists, create a placeholder
            checkpointMessages.push({
              id: `msg-${Date.now()}-${index}-tools`,
              timestamp,
              type: "gemini",
              content: "[Tool calls executed]",
              toolCalls,
            });
          }
        }
      });

      return checkpointMessages;
    },
    [],
  );

  const buildCheckpointMessagesFromClientHistory = useCallback(
    (clientHistory: Content[]): CheckpointMessage[] => {
      const timestamp = new Date().toISOString();
      const checkpointMessages: CheckpointMessage[] = [];

      clientHistory.forEach((content, index) => {
        // Extract text parts
        const text =
          content.parts
            ?.filter(
              (
                part,
              ): part is {
                text: string;
              } =>
                !!part &&
                typeof part === "object" &&
                "text" in part &&
                typeof part.text === "string",
            )
            .map((part) => part.text)
            .join("") ?? "";

        // Extract tool calls (functionCall parts)
        const toolCalls: CheckpointToolCall[] = [];
        content.parts?.forEach((part) => {
          if (part && typeof part === "object" && "functionCall" in part) {
            const functionCall = part.functionCall;
            if (functionCall && typeof functionCall === "object") {
              toolCalls.push({
                id:
                  (functionCall.id as string) ??
                  `tool-${index}-${toolCalls.length}`,
                name: (functionCall.name as string) ?? "",
                args: (functionCall.args as Record<string, unknown>) || {},
                result: null, // Tool results are in functionResponse parts
              });
            }
          }
        });

        if (!text && toolCalls.length === 0) {
          return;
        }

        const message: CheckpointMessage = {
          id: `msg-${Date.now()}-${index}`,
          timestamp,
          type: content.role === "user" ? "user" : "gemini",
          content: (text ?? "") || (toolCalls.length > 0 ? "[Tool calls]" : ""),
        };

        if (toolCalls.length > 0) {
          message.toolCalls = toolCalls;
        }

        checkpointMessages.push(message);
      });

      return checkpointMessages;
    },
    [],
  );

  const buildCheckpointContextSnapshot = useCallback(():
    | CheckpointContextSnapshot
    | undefined => {
    try {
      const clientHistory = geminiClient.getHistory();
      if (!Array.isArray(clientHistory) || clientHistory.length === 0) {
        return undefined;
      }

      return {
        clientHistory,
        promptTokenCount: stats.lastPromptTokenCount,
        currentContextTokenCount: stats.currentContextTokenCount,
        model: config.getModel(),
      };
    } catch {
      return undefined;
    }
  }, [
    config,
    geminiClient,
    stats.currentContextTokenCount,
    stats.lastPromptTokenCount,
  ]);

  const saveCheckpointFromHistory = useCallback(
    (
      historyItems: HistoryItem[],
      contextSnapshotOverride?: CheckpointContextSnapshot,
    ) => {
      try {
        if (!config.getCheckpointingEnabled()) {
          return false;
        }

        if (historyItems.length === 0) {
          return false;
        }

        const contextSnapshot =
          contextSnapshotOverride ?? buildCheckpointContextSnapshot();
        const checkpointMessages =
          contextSnapshot && Array.isArray(contextSnapshot.clientHistory)
            ? buildCheckpointMessagesFromClientHistory(
                contextSnapshot.clientHistory,
              )
            : buildCheckpointMessages(historyItems);
        if (checkpointMessages.length === 0) {
          return false;
        }

        const checkpointService = new CheckpointService(config);
        const sessionMeta: CheckpointSessionMeta = {
          mode: "tui",
          cwd: process.cwd(),
          capabilities: {
            observe: true,
            control: false,
            interact: true,
          },
        };
        const checkpointId = checkpointService.saveCheckpoint(
          checkpointMessages,
          contextSnapshot,
          sessionMeta,
        );
        console.debug(
          `[Checkpoint] Saved checkpoint ${checkpointId} with ${checkpointMessages.length} messages`,
        );
        return true;
      } catch (error) {
        // Silent failure - checkpoint saving should not interrupt the user
        console.debug("Failed to save checkpoint:", error);
        onDebugMessage(
          `[Checkpoint] Failed to save checkpoint: ${getErrorMessage(error)}`,
        );
        return false;
      }
    },
    [
      buildCheckpointContextSnapshot,
      buildCheckpointMessages,
      buildCheckpointMessagesFromClientHistory,
      config,
    ],
  );

  useEffect(() => {
    if (!config.getCheckpointingEnabled()) {
      checkpointPendingForTurnRef.current = false;
      checkpointTurnStartTimestampRef.current = null;
      return;
    }

    if (!checkpointPendingForTurnRef.current) {
      return;
    }

    if (
      streamingState !== StreamingState.Idle ||
      isSubmittingQueryRef.current
    ) {
      return;
    }

    const checkpointTurnStart = checkpointTurnStartTimestampRef.current;
    if (!checkpointTurnStart) {
      return;
    }

    const contextSnapshot = buildCheckpointContextSnapshot();
    if (!contextSnapshot) {
      const hasTurnOutputInHistory = history.some(
        (item) =>
          (item.type === MessageType.GEMINI ||
            item.type === "gemini_content" ||
            item.type === "tool_group") &&
          item.id >= checkpointTurnStart,
      );

      if (!hasTurnOutputInHistory) {
        return;
      }
    }

    const saved = saveCheckpointFromHistory(history, contextSnapshot);
    if (saved) {
      checkpointPendingForTurnRef.current = false;
      checkpointTurnStartTimestampRef.current = null;
    } else {
      console.debug(
        `[Checkpoint] Failed to save turn ending at ${new Date(checkpointTurnStart).toISOString()}`,
      );
      onDebugMessage(
        `[Checkpoint] Save deferred or failed for turn ending at ${new Date(checkpointTurnStart).toISOString()}`,
      );
    }
  }, [
    buildCheckpointContextSnapshot,
    config,
    history,
    onDebugMessage,
    saveCheckpointFromHistory,
    streamingState,
  ]);

  const handleFinishedEvent = useCallback(
    (event: ServerGeminiFinishedEvent, userMessageTimestamp: number) => {
      const finishReason = event.value;

      const finishReasonMessages: Record<FinishReason, string | undefined> = {
        [FinishReason.FINISH_REASON_UNSPECIFIED]: undefined,
        [FinishReason.STOP]: undefined,
        [FinishReason.MAX_TOKENS]: "Response truncated due to token limits.",
        [FinishReason.SAFETY]: "Response stopped due to safety reasons.",
        [FinishReason.RECITATION]: "Response stopped due to recitation policy.",
        [FinishReason.LANGUAGE]:
          "Response stopped due to unsupported language.",
        [FinishReason.BLOCKLIST]: "Response stopped due to forbidden terms.",
        [FinishReason.PROHIBITED_CONTENT]:
          "Response stopped due to prohibited content.",
        [FinishReason.SPII]:
          "Response stopped due to sensitive personally identifiable information.",
        [FinishReason.OTHER]: "Response stopped for other reasons.",
        [FinishReason.MALFORMED_FUNCTION_CALL]:
          "Response stopped due to malformed function call.",
        [FinishReason.IMAGE_SAFETY]:
          "Response stopped due to image safety violations.",
        [FinishReason.UNEXPECTED_TOOL_CALL]:
          "Response stopped due to unexpected tool call.",
      };

      const message = finishReasonMessages[finishReason];
      if (message) {
        addItem(
          {
            type: "info",
            text: `⚠️  ${message}`,
          },
          userMessageTimestamp,
        );
      }

      const durationMs = Date.now() - userMessageTimestamp;
      if (durationMs >= 0) {
        addItem(
          {
            type: MessageType.INFO,
            text: `⏱ Model response time: ${formatElapsed(durationMs)}`,
          },
          Date.now(),
        );
      }
    },
    [addItem],
  );

  const handleChatCompressionEvent = useCallback(
    (eventValue: ServerGeminiChatCompressedEvent["value"]) =>
      addItem(
        {
          type: "info",
          text:
            `IMPORTANT: This conversation approached the input token limit for ${config.getModel()}. ` +
            `A compressed context will be sent for future messages (compressed from: ` +
            `${eventValue?.originalTokenCount ?? "unknown"} to ` +
            `${eventValue?.newTokenCount ?? "unknown"} tokens).`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleMaxSessionTurnsEvent = useCallback(
    () =>
      addItem(
        {
          type: "info",
          text:
            `The session has reached the maximum number of turns: ${config.getMaxSessionTurns()}. ` +
            `Please update this limit in your setting.json file.`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleSessionTokenLimitExceededEvent = useCallback(
    (value: { currentTokens: number; limit: number; message: string }) =>
      addItem(
        {
          type: "error",
          text:
            `🚫 Session token limit exceeded: ${value.currentTokens.toLocaleString()} tokens > ${value.limit.toLocaleString()} limit.\n\n` +
            `💡 Solutions:\n` +
            `   • Start a new session: Use /clear command\n` +
            `   • Increase limit: Add "sessionTokenLimit": (e.g., 128000) to your settings.json\n` +
            `   • Compress history: Use /compress command to compress history`,
        },
        Date.now(),
      ),
    [addItem],
  );

  const handleTokenBudgetWarningEvent = useCallback(
    (value: { tokens: number; limit: number; effectiveLimit: number }) =>
      addItem(
        {
          type: "info",
          text:
            `⚠️  Context usage is high: ${value.tokens.toLocaleString()} of ${value.limit.toLocaleString()} tokens ` +
            `(safe budget ≈ ${value.effectiveLimit.toLocaleString()}). Consider narrowing directory listings, requesting files on demand, or running /compress.`,
        },
        Date.now(),
      ),
    [addItem],
  );

  const handleContextWindowRecoveryEvent = useCallback(
    (value: { message: string }) =>
      addItem(
        {
          type: "info",
          text: `⚠️  ${value.message}`,
        },
        Date.now(),
      ),
    [addItem],
  );

  const handleToolOutputTruncatedEvent = useCallback(
    (value: { toolName: string; output: string }) =>
      addItem(
        {
          type: "info",
          text: `⚠️  The output of the tool '${value.toolName}' was too long and has been truncated.`,
        },
        Date.now(),
      ),
    [addItem],
  );

  const handleLoopDetectedEvent = useCallback(() => {
    // Signal the orchestrator that we've detected a loop (for visibility)
    setRegisteredSessionHealth({
      state: "loop_fault",
      reason: "loop_detected",
      confidence: 0.95,
      evidence: {
        message:
          "A potential loop was detected. This can happen due to repetitive tool calls or other model behavior.",
        },
    });
    void updateSessionDetails({
      last_error: "Potential loop detected",
      last_error_at: new Date().toISOString(),
    });

    addItem(
      {
        type: "info",
        text:
          "A potential loop was detected. Triggering an automatic recovery prompt to continue with a different approach.",
      },
      Date.now(),
    );
  }, [addItem]);

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
      signal: AbortSignal,
    ): Promise<StreamProcessingStatus> => {
      let geminiMessageBuffer = "";
      const toolCallRequests: ToolCallRequestInfo[] = [];
      for await (const event of stream) {
        switch (event.type) {
          case ServerGeminiEventType.Thought:
            setThought(event.value);
            break;
          case ServerGeminiEventType.Content:
            geminiMessageBuffer = handleContentEvent(
              event.value,
              geminiMessageBuffer,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.ToolCallRequest: {
            const signature = buildToolCallSignature(event.value);
            const activeCount =
              toolCallSignatureCountsRef.current.get(signature) ?? 0;
            if (activeCount > 0) {
              needsAntiRepeatHintRef.current = true;
              addItem(
                {
                  type: MessageType.INFO,
                  text: `⚠️ Duplicate tool request '${event.value.name}' ignored while a previous request is still running.`,
                },
                Date.now(),
              );
              break;
            }
            toolCallSignatureCountsRef.current.set(signature, activeCount + 1);
            toolCallIdToSignatureRef.current.set(event.value.callId, signature);
            toolCallRequests.push(event.value);
            break;
          }
          case ServerGeminiEventType.UserCancelled:
            handleUserCancelledEvent(userMessageTimestamp);
            break;
          case ServerGeminiEventType.Error:
            handleErrorEvent(event.value, userMessageTimestamp);
            break;
          case ServerGeminiEventType.ChatCompressed:
            handleChatCompressionEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallConfirmation:
          case ServerGeminiEventType.ToolCallResponse:
            // do nothing
            break;
          case ServerGeminiEventType.MaxSessionTurns:
            handleMaxSessionTurnsEvent();
            break;
          case ServerGeminiEventType.SessionTokenLimitExceeded:
            handleSessionTokenLimitExceededEvent(event.value);
            break;
          case ServerGeminiEventType.TokenBudgetWarning:
            handleTokenBudgetWarningEvent(event.value);
            break;
          case ServerGeminiEventType.ContextWindowRecovery:
            handleContextWindowRecoveryEvent(event.value);
            break;
          case ServerGeminiEventType.ToolOutputTruncated:
            handleToolOutputTruncatedEvent(event.value);
            break;
          case ServerGeminiEventType.Finished:
            handleFinishedEvent(
              event as ServerGeminiFinishedEvent,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.LoopDetected:
            // handle later because we want to move pending history to history
            // before we add loop detected message to history
            loopDetectedRef.current = true;
            break;
          case ServerGeminiEventType.Retry:
            // Will add the missing logic later
            break;
          default: {
            // enforces exhaustive switch-case
            const unreachable: never = event;
            return unreachable;
          }
        }
      }
      if (toolCallRequests.length > 0) {
        scheduleToolCalls(toolCallRequests, signal);
      } else if (
        turnStartTimestampRef.current !== null &&
        !turnDurationLoggedRef.current
      ) {
        const durationMs = Date.now() - turnStartTimestampRef.current;
        if (durationMs >= 0) {
          addItem(
            {
              type: MessageType.INFO,
              text: `⏱ Overall turn time: ${formatElapsed(durationMs)}`.trim(),
            },
            Date.now(),
          );
        }
        turnDurationLoggedRef.current = true;
        turnStartTimestampRef.current = null;
      }
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
      handleChatCompressionEvent,
      handleFinishedEvent,
      handleMaxSessionTurnsEvent,
      handleSessionTokenLimitExceededEvent,
      handleTokenBudgetWarningEvent,
      handleContextWindowRecoveryEvent,
      handleToolOutputTruncatedEvent,
      addItem,
      turnStartTimestampRef,
      turnDurationLoggedRef,
    ],
  );

  const submitQuery = useCallback(
    async (
      query: PartListUnion,
      options?: { isContinuation: boolean },
      prompt_id?: string,
    ) => {
      // Prevent concurrent executions of submitQuery, but allow continuations
      // which are part of the same logical flow (tool responses)
      if (isSubmittingQueryRef.current && !options?.isContinuation) {
        return;
      }

      if (
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation) &&
        !options?.isContinuation
      )
        return;

      // Set the flag to indicate we're now executing
      isSubmittingQueryRef.current = true;

      const userMessageTimestamp = Date.now();

      if (!options?.isContinuation) {
        turnStartTimestampRef.current = userMessageTimestamp;
        turnDurationLoggedRef.current = false;

        // Reset recovery retry counter on new successful query
        recoveryRetryCountRef.current = 0;
      }

      // Reset quota error flag when starting a new query (not a continuation)
      if (!options?.isContinuation) {
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);
      }

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;
      turnCancelledRef.current = false;

      if (!prompt_id) {
        prompt_id = config.getSessionId() + "########" + getPromptCount();
      }

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        abortSignal,
        prompt_id!,
      );

      if (!shouldProceed || queryToSend === null) {
        isSubmittingQueryRef.current = false;
        return;
      }

      if (!options?.isContinuation) {
        lastRestartableQueryRef.current = queryToSend;
      }

      let finalQueryToSend = queryToSend;
      if (!options?.isContinuation) {
        try {
          const injected = await injectCollabContextForTurn({
            baseDir: config.getTargetDir(),
            sessionId: config.getSessionId(),
            query: finalQueryToSend,
          });
          finalQueryToSend = injected.query;
          onDebugMessage(
            `[Collab] Injected context (sessions=${injected.sessionsCount}, unread=${injected.unreadCount}, cursor=${injected.cursorBefore}->${injected.cursorAfter}).`,
          );
        } catch (error) {
          onDebugMessage(
            `[Collab] Context injection failed: ${getErrorMessage(error)}`,
          );
        }
      }

      // Handle vision switch requirement
      const visionSwitchResult = await handleVisionSwitch(
        finalQueryToSend,
        userMessageTimestamp,
        options?.isContinuation || false,
      );

      if (!visionSwitchResult.shouldProceed) {
        isSubmittingQueryRef.current = false;
        return;
      }

      if (!options?.isContinuation) {
        startNewPrompt();
        setThought(null); // Reset thought when starting a new prompt
        if (config.getCheckpointingEnabled()) {
          checkpointPendingForTurnRef.current = true;
          checkpointTurnStartTimestampRef.current = userMessageTimestamp;
        } else {
          checkpointPendingForTurnRef.current = false;
          checkpointTurnStartTimestampRef.current = null;
        }
      }

      setIsResponding(true);
      setInitError(null);

      try {
        if (refreshProviderState) {
          try {
            await refreshProviderState();
          } catch (error) {
            if (config.getDebugMode()) {
              console.debug(
                "[LMStudio] Failed to refresh provider state:",
                error,
              );
            }
          }
        }

        const stream = geminiClient.sendMessageStream(
          finalQueryToSend,
          abortSignal,
          prompt_id!,
        );
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
          abortSignal,
        );

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          // Restore original model if it was temporarily overridden
          restoreOriginalModel().catch((error) => {
            console.error("Failed to restore original model:", error);
          });
          isSubmittingQueryRef.current = false;
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }
        if (loopDetectedRef.current) {
          loopDetectedRef.current = false;
          handleLoopDetectedEvent();
          // Reset retry counter for loop recovery (different issue type)
          recoveryRetryCountRef.current = 0;
          // Trigger self-recovery for the loop
          handleSelfRecovery("loop");
        }

        // Restore original model if it was temporarily overridden
        restoreOriginalModel().catch((error) => {
          console.error("Failed to restore original model:", error);
        });
      } catch (error: unknown) {
        checkpointPendingForTurnRef.current = false;
        checkpointTurnStartTimestampRef.current = null;
        // Restore original model if it was temporarily overridden
        restoreOriginalModel().catch((error) => {
          console.error("Failed to restore original model:", error);
        });

        if (error instanceof UnauthorizedError) {
          onAuthError();
        } else if (!isNodeError(error) || error.name !== "AbortError") {
          addItem(
            {
              type: MessageType.ERROR,
              text: parseAndFormatApiError(
                getErrorMessage(error) || "Unknown error",
                config.getContentGeneratorConfig()?.authType,
                undefined,
                config.getModel(),
                DEFAULT_GEMINI_FLASH_MODEL,
              ),
            },
            userMessageTimestamp,
          );
        }
      } finally {
        setIsResponding(false);
        isSubmittingQueryRef.current = false;
        const queuedPrompt = pendingSelfRecoveryPromptRef.current;
        if (queuedPrompt) {
          pendingSelfRecoveryPromptRef.current = null;
          setTimeout(() => {
            void submitQuery(queuedPrompt, { isContinuation: true });
          }, 0);
        }
      }
    },
    [
      streamingState,
      setModelSwitchedFromQuotaError,
      prepareQueryForGemini,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
      geminiClient,
      onAuthError,
      config,
      startNewPrompt,
      getPromptCount,
      handleLoopDetectedEvent,
      handleVisionSwitch,
      restoreOriginalModel,
      refreshProviderState,
    ],
  );

  const restartLastTurn = useCallback(async () => {
    if (streamingState === StreamingState.WaitingForConfirmation) {
      return {
        accepted: false,
        reason: "awaiting_confirmation",
      };
    }

    const restartableQuery = lastRestartableQueryRef.current;
    if (!restartableQuery) {
      return {
        accepted: false,
        reason: "no_restartable_turn",
      };
    }

    if (
      streamingState === StreamingState.Responding ||
      isSubmittingQueryRef.current
    ) {
      cancelOngoingRequest();
      await Promise.resolve();
      if (isSubmittingQueryRef.current) {
        return {
          accepted: false,
          reason: "cancel_in_progress",
        };
      }
    }

    void submitQuery(restartableQuery);
    return {
      accepted: true,
    };
  }, [cancelOngoingRequest, streamingState, submitQuery]);

  const appendInProcessTaskLog = useCallback(
    async (
      task: SessionEnqueueTaskPayload,
      status: "started" | "completed" | "failed",
      detail?: string,
    ): Promise<string> => {
      const logPath = path.join(
        process.cwd(),
        ".lowcal",
        "in-process-tasks",
        `${config.getSessionId()}.jsonl`,
      );
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.appendFile(
        logPath,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          task_id: task.task_id,
          status,
          action_type: task.action_type,
          detail,
        })}\n`,
        "utf-8",
      );
      return logPath;
    },
    [config],
  );

  const appendInProcessMailboxMessage = useCallback(
    async (
      task: SessionEnqueueTaskPayload,
      status: "success" | "error",
      preview: string,
      outputPath: string,
    ): Promise<void> => {
      const toSessionId = task.return_to_session_id;
      if (!toSessionId) return;

      const mailboxPath = path.join(
        process.cwd(),
        ".lowcal",
        "session-messages",
        `${toSessionId}.jsonl`,
      );
      await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
      await fs.appendFile(
        mailboxPath,
        `${JSON.stringify({
          to_session_id: toSessionId,
          from_session_id: config.getSessionId(),
          from_task_id: task.task_id,
          job_id: task.task_id,
          status,
          timestamp: new Date().toISOString(),
          prompt_preview: task.action_value.trim().slice(0, 400),
          preview: preview.trim().slice(0, 1200),
          output_path: outputPath,
        })}\n`,
        "utf-8",
      );
    },
    [config],
  );

  const applyInProcessRuntimeOverrides = useCallback(
    async (task: SessionEnqueueTaskPayload): Promise<() => Promise<void>> => {
      const profile = task.runtime_profile;
      const previousModel = config.getModel();
      const previousAuthType = normalizeAuthType(
        config.getContentGeneratorConfig()?.authType,
      );
      const previousOpenAIBaseUrl = process.env["OPENAI_BASE_URL"];
      const previousOpenAIApiKey = process.env["OPENAI_API_KEY"];
      const previousOpenAIModel = process.env["OPENAI_MODEL"];
      const previousTaskSystemPrompt = process.env[ENV_TASK_SYSTEM_PROMPT_B64];
      const previousToolsetCollection = toolConfig.activeCollection;
      let runtimeAuthRefreshed = false;

      const restore = async () => {
        if (previousOpenAIBaseUrl === undefined) {
          delete process.env["OPENAI_BASE_URL"];
        } else {
          process.env["OPENAI_BASE_URL"] = previousOpenAIBaseUrl;
        }
        if (previousOpenAIApiKey === undefined) {
          delete process.env["OPENAI_API_KEY"];
        } else {
          process.env["OPENAI_API_KEY"] = previousOpenAIApiKey;
        }
        if (previousOpenAIModel === undefined) {
          delete process.env["OPENAI_MODEL"];
        } else {
          process.env["OPENAI_MODEL"] = previousOpenAIModel;
        }
        if (previousTaskSystemPrompt === undefined) {
          delete process.env[ENV_TASK_SYSTEM_PROMPT_B64];
        } else {
          process.env[ENV_TASK_SYSTEM_PROMPT_B64] = previousTaskSystemPrompt;
        }
        toolConfig.activeCollection = previousToolsetCollection;

        const currentAuthType = normalizeAuthType(
          config.getContentGeneratorConfig()?.authType,
        );
        if (
          previousAuthType &&
          (runtimeAuthRefreshed ||
            (currentAuthType && previousAuthType !== currentAuthType))
        ) {
          await config.refreshAuth(previousAuthType);
        }
        if (previousModel && config.getModel() !== previousModel) {
          await config.setModel(previousModel, {
            reason: "manual",
            context: "restore_in_process_task_runtime",
          });
        }
      };

      if (!profile) {
        return restore;
      }

      try {
        const runtimeAuth = profile.auth;
        const runtimeProviderId =
          typeof runtimeAuth?.providerId === "string" &&
          runtimeAuth.providerId.trim().length > 0
            ? runtimeAuth.providerId.trim()
            : undefined;
        let providerBaseUrl: string | undefined;
        let providerApiKey: string | undefined;
        if (runtimeProviderId) {
          try {
            const { loadSettings } = await import("../../config/settings.js");
            const resolvedSettings = loadSettings(process.cwd());
            const providers = resolvedSettings.merged.security?.auth
              ?.providers as
              | Record<string, { baseUrl?: string; apiKey?: string }>
              | undefined;
            providerBaseUrl = providers?.[runtimeProviderId]?.baseUrl?.trim();
            providerApiKey = providers?.[runtimeProviderId]?.apiKey?.trim();
          } catch {
            // Ignore settings load errors and fall back to env vars.
          }
        }
        const runtimeBaseUrl =
          runtimeAuth?.baseUrl && runtimeAuth.baseUrl.trim().length > 0
            ? runtimeAuth.baseUrl.trim()
            : providerBaseUrl;
        if (runtimeBaseUrl) {
          process.env["OPENAI_BASE_URL"] = runtimeBaseUrl;
        }
        const envVarName =
          runtimeAuth?.apiKeyEnvVar &&
          runtimeAuth.apiKeyEnvVar.trim().length > 0
            ? runtimeAuth.apiKeyEnvVar.trim()
            : undefined;
        const envApiKey = envVarName
          ? process.env[envVarName]?.trim()
          : undefined;
        const runtimeApiKey =
          providerApiKey ||
          envApiKey ||
          (runtimeProviderId === "lmstudio" ? "lmstudio-local-key" : undefined);
        if (!runtimeApiKey && envVarName) {
          throw new Error(
            `Task runtime requires API key env var ${envVarName}, but it is not set.`,
          );
        }
        if (runtimeApiKey) {
          process.env["OPENAI_API_KEY"] = runtimeApiKey;
        }

        const modelOverride =
          profile.model?.name && profile.model.name.trim().length > 0
            ? profile.model.name.trim()
            : undefined;
        if ((modelOverride ?? previousModel)?.trim().length > 0) {
          process.env["OPENAI_MODEL"] = (modelOverride ?? previousModel).trim();
        }

        const runtimeSystemPrompt = profile.system_prompt;
        if (runtimeSystemPrompt) {
          if (runtimeSystemPrompt.disable === true) {
            process.env[ENV_TASK_SYSTEM_PROMPT_B64] = Buffer.from(
              JSON.stringify({ disable: true }),
              "utf-8",
            ).toString("base64");
          } else {
            const names = Array.isArray(runtimeSystemPrompt.names)
              ? runtimeSystemPrompt.names
                  .map((entry) =>
                    typeof entry === "string" ? entry.trim() : "",
                  )
                  .filter((entry) => entry.length > 0)
              : [];
            if (names.length > 0) {
              process.env[ENV_TASK_SYSTEM_PROMPT_B64] = Buffer.from(
                JSON.stringify({
                  names,
                  exclusive: runtimeSystemPrompt.exclusive === true,
                }),
                "utf-8",
              ).toString("base64");
            } else {
              delete process.env[ENV_TASK_SYSTEM_PROMPT_B64];
            }
          }
        }

        const runtimeToolsetCollection =
          profile.toolset?.collection?.trim();
        if (runtimeToolsetCollection && runtimeToolsetCollection.length > 0) {
          if (!toolConfig.collections[runtimeToolsetCollection]) {
            const available = Object.keys(toolConfig.collections)
              .sort()
              .join(", ");
            throw new Error(
              `Task runtime toolset "${runtimeToolsetCollection}" was not found. Available collections: ${available || "(none)"}.`,
            );
          }
          toolConfig.activeCollection = runtimeToolsetCollection;
        }

        const authOverride = normalizeAuthType(
          runtimeAuth?.selectedType ?? runtimeAuth?.providerId,
        );
        const currentAuthType = normalizeAuthType(
          config.getContentGeneratorConfig()?.authType,
        );
        const targetAuthType = authOverride ?? currentAuthType;
        const runtimeOpenAIConfigChanged =
          (runtimeBaseUrl !== undefined &&
            runtimeBaseUrl !== previousOpenAIBaseUrl) ||
          (runtimeApiKey !== undefined &&
            runtimeApiKey !== previousOpenAIApiKey);

        const shouldRefreshAuth = Boolean(
          targetAuthType &&
            ((currentAuthType && targetAuthType !== currentAuthType) ||
              runtimeOpenAIConfigChanged),
        );
        if (shouldRefreshAuth && targetAuthType) {
          await config.refreshAuth(targetAuthType);
          runtimeAuthRefreshed = true;
        }

        if (modelOverride && modelOverride !== config.getModel()) {
          await config.setModel(modelOverride, {
            reason: "manual",
            context: "in_process_task_runtime_override",
          });
        }
      } catch (error) {
        await restore();
        throw error;
      }

      return restore;
    },
    [config],
  );

  const executeInProcessTask = useCallback(
    async (task: SessionEnqueueTaskPayload): Promise<void> => {
      let logPath = path.join(
        process.cwd(),
        ".lowcal",
        "in-process-tasks",
        `${config.getSessionId()}.jsonl`,
      );
      const runtimeProfile = task.runtime_profile;
      const promptPreview = task.action_value.trim().slice(0, 400);

      await upsertLaunchTaskState(
        process.cwd(),
        task.task_id,
        (current, nowIso) => ({
          task_id: task.task_id,
          status: "running",
          created_at: current?.created_at ?? nowIso,
          started_at: current?.started_at ?? nowIso,
          last_heartbeat: nowIso,
          prompt_preview: current?.prompt_preview ?? promptPreview,
          parent_session_id:
            current?.parent_session_id ??
            task.return_to_session_id ??
            config.getSessionId(),
          source_session_id:
            current?.source_session_id ?? task.source_session_id,
          dedupe_key: current?.dedupe_key,
          execution_mode_requested: "in_process",
          execution_mode_actual: "in_process",
          model_requested:
            current?.model_requested ?? runtimeProfile?.model?.name,
          model_actual: current?.model_actual ?? config.getModel(),
          auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
          auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
          runtime_profile: current?.runtime_profile ?? runtimeProfile,
          result_ref: current?.result_ref,
          pid: current?.pid,
          tab_name: current?.tab_name,
          last_error: undefined,
        }),
      );

      let restoreRuntime: (() => Promise<void>) | undefined;
      try {
        logPath = await appendInProcessTaskLog(task, "started");
        restoreRuntime = await applyInProcessRuntimeOverrides(task);

        await submitQuery(task.action_value);

        await upsertLaunchTaskState(
          process.cwd(),
          task.task_id,
          (current, nowIso) => ({
            task_id: task.task_id,
            status: "completed",
            created_at: current?.created_at ?? nowIso,
            started_at: current?.started_at ?? nowIso,
            finished_at: nowIso,
            last_heartbeat: nowIso,
            prompt_preview: current?.prompt_preview ?? promptPreview,
            parent_session_id:
              current?.parent_session_id ??
              task.return_to_session_id ??
              config.getSessionId(),
            source_session_id:
              current?.source_session_id ?? task.source_session_id,
            dedupe_key: current?.dedupe_key,
            execution_mode_requested: "in_process",
            execution_mode_actual: "in_process",
            model_requested:
              current?.model_requested ?? runtimeProfile?.model?.name,
            model_actual: config.getModel(),
            auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
            auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
            runtime_profile: current?.runtime_profile ?? runtimeProfile,
            result_ref: {
              mailbox_path:
                current?.result_ref?.mailbox_path ??
                (task.return_to_session_id
                  ? path.join(
                      process.cwd(),
                      ".lowcal",
                      "session-messages",
                      `${task.return_to_session_id}.jsonl`,
                    )
                  : undefined),
              output_path: logPath,
              child_session_id: config.getSessionId(),
              message_timestamp: nowIso,
            },
            pid: current?.pid,
            tab_name: current?.tab_name,
            last_error: undefined,
          }),
        );

        await appendInProcessTaskLog(task, "completed");
        await appendInProcessMailboxMessage(
          task,
          "success",
          `In-process task ${task.task_id} completed successfully.`,
          logPath,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await appendInProcessTaskLog(task, "failed", message);
        await upsertLaunchTaskState(
          process.cwd(),
          task.task_id,
          (current, nowIso) => ({
            task_id: task.task_id,
            status: "failed",
            created_at: current?.created_at ?? nowIso,
            started_at: current?.started_at ?? nowIso,
            finished_at: nowIso,
            last_heartbeat: nowIso,
            prompt_preview: current?.prompt_preview ?? promptPreview,
            parent_session_id:
              current?.parent_session_id ??
              task.return_to_session_id ??
              config.getSessionId(),
            source_session_id:
              current?.source_session_id ?? task.source_session_id,
            dedupe_key: current?.dedupe_key,
            execution_mode_requested: "in_process",
            execution_mode_actual: "in_process",
            model_requested:
              current?.model_requested ?? runtimeProfile?.model?.name,
            model_actual: config.getModel(),
            auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
            auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
            runtime_profile: current?.runtime_profile ?? runtimeProfile,
            result_ref: {
              mailbox_path:
                current?.result_ref?.mailbox_path ??
                (task.return_to_session_id
                  ? path.join(
                      process.cwd(),
                      ".lowcal",
                      "session-messages",
                      `${task.return_to_session_id}.jsonl`,
                    )
                  : undefined),
              output_path: logPath,
              child_session_id: config.getSessionId(),
              message_timestamp: nowIso,
            },
            pid: current?.pid,
            tab_name: current?.tab_name,
            last_error: message,
          }),
        );
        await appendInProcessMailboxMessage(
          task,
          "error",
          `In-process task ${task.task_id} failed: ${message}`,
          logPath,
        );
      } finally {
        if (restoreRuntime) {
          try {
            await restoreRuntime();
          } catch (restoreError) {
            const message =
              restoreError instanceof Error
                ? restoreError.message
                : String(restoreError);
            addItem(
              {
                type: MessageType.ERROR,
                text: `Failed to restore runtime after in-process task ${task.task_id}: ${message}`,
              },
              Date.now(),
            );
          }
        }
      }
    },
    [
      addItem,
      appendInProcessMailboxMessage,
      appendInProcessTaskLog,
      applyInProcessRuntimeOverrides,
      config,
      submitQuery,
    ],
  );

  const drainInProcessTaskQueue = useCallback(async (): Promise<void> => {
    if (processingInProcessTaskRef.current) {
      return;
    }
    if (streamingStateRef.current !== StreamingState.Idle) {
      return;
    }
    const nextTask = inProcessTaskQueueRef.current.shift();
    if (!nextTask) {
      return;
    }

    processingInProcessTaskRef.current = true;
    try {
      await executeInProcessTask(nextTask);
    } finally {
      processingInProcessTaskRef.current = false;
      if (inProcessTaskQueueRef.current.length > 0) {
        void drainInProcessTaskQueue();
      }
    }
  }, [executeInProcessTask]);

  // Self-recovery function - called when loop detection or hard error occurs
  const handleSelfRecovery = useCallback(
    (errorType: "loop" | "error", errorMessage?: string) => {
      if (errorType === "loop") {
        let loopRecoveryPrompt = LOOP_RECOVERY_PROMPT;
        try {
          const contextSnippet = buildRecoveryContextSnippet(
            geminiClient.getHistory(),
          );
          if (contextSnippet) {
            loopRecoveryPrompt += ` Recent context: "${contextSnippet}".`;
          }
        } catch {
          // Ignore context extraction errors and use the default recovery prompt.
        }
        pendingSelfRecoveryPromptRef.current = loopRecoveryPrompt;
      } else if (errorMessage) {
        // Increment retry counter for errors
        recoveryRetryCountRef.current += 1;

        // Check if we've exceeded max retries
        const maxRetries = 3;
        if (recoveryRetryCountRef.current > maxRetries) {
          addItem(
            {
              type: MessageType.ERROR,
              text: `❌ Recovery failed after ${maxRetries} attempts. The error is not recoverable. Please try a different approach.`,
            },
            Date.now(),
          );
          // Reset the counter for future sessions
          recoveryRetryCountRef.current = 0;
          return;
        }

        // For hard errors, get recent history and include context
        let contextSnippet = "";
        try {
          const summary = buildRecoveryContextSnippet(geminiClient.getHistory());
          if (summary) {
            contextSnippet = ` Here's recent context: "${summary}".`;
          }
        } catch {
          // Ignore context extraction errors and continue with error-only prompt.
        }

        pendingSelfRecoveryPromptRef.current =
          `An error occurred: ${errorMessage}.${contextSnippet} Please continue with your task or ask for help.`;
      }
    },
    [addItem, geminiClient],
  );

  useEffect(() => {
    if (streamingState === StreamingState.Idle) {
      void drainInProcessTaskQueue();
    }
  }, [drainInProcessTaskQueue, streamingState]);

  useEffect(() => {
    setSessionControlHandlers({
      cancelTurn: () => {
        if (streamingState !== StreamingState.Responding) {
          return {
            accepted: false,
            reason: "no_active_turn",
          };
        }
        cancelOngoingRequest();
        return { accepted: true };
      },
      restartTurn: restartLastTurn,
      enqueueTask: (payload) => {
        inProcessTaskQueueRef.current.push(payload);
        if (streamingStateRef.current === StreamingState.Idle) {
          void drainInProcessTaskQueue();
        }
        return { accepted: true };
      },
    });

    return () => {
      setSessionControlHandlers({});
    };
  }, [
    cancelOngoingRequest,
    drainInProcessTaskQueue,
    restartLastTurn,
    streamingState,
  ]);

  const handleCompletedTools = useCallback(
    async (completedToolCallsFromScheduler: TrackedToolCall[]) => {
      if (isResponding) {
        return;
      }

      const completedAndReadyToSubmitTools =
        completedToolCallsFromScheduler.filter(
          (
            tc: TrackedToolCall,
          ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
            const isTerminalState =
              tc.status === "success" ||
              tc.status === "error" ||
              tc.status === "cancelled";

            if (isTerminalState) {
              const completedOrCancelledCall = tc as
                | TrackedCompletedToolCall
                | TrackedCancelledToolCall;
              return (
                completedOrCancelledCall.response?.responseParts !== undefined
              );
            }
            return false;
          },
        );

      // Finalize any client-initiated tools as soon as they are done.
      const clientTools = completedAndReadyToSubmitTools.filter(
        (t) => t.request.isClientInitiated,
      );
      if (clientTools.length > 0) {
        markToolsAsSubmitted(clientTools.map((t) => t.request.callId));
      }

      // Identify new, successful save_memory calls that we haven't processed yet.
      const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === "save_memory" &&
          t.status === "success" &&
          !processedMemoryToolsRef.current.has(t.request.callId),
      );

      if (newSuccessfulMemorySaves.length > 0) {
        // Perform the refresh only if there are new ones.
        void performMemoryRefresh();
        // Mark them as processed so we don't do this again on the next render.
        newSuccessfulMemorySaves.forEach((t) =>
          processedMemoryToolsRef.current.add(t.request.callId),
        );
      }

      for (const toolCall of completedAndReadyToSubmitTools) {
        const durationMs = toolCall.durationMs;
        if (durationMs === undefined) {
          continue;
        }
        const statusLabel =
          toolCall.status === "success"
            ? "completed"
            : toolCall.status === "error"
              ? "failed"
              : "cancelled";
        const isClient = toolCall.request.isClientInitiated === true;
        const prefix = isClient ? "🛠️" : "🔧";
        const label = isClient ? "Client tool" : "Tool";
        addItem(
          {
            type: MessageType.INFO,
            text: `${prefix} ${label} ${toolCall.request.name} ${statusLabel} in ${formatElapsed(durationMs)}.`,
          },
          Date.now(),
        );
      }

      const geminiTools = completedAndReadyToSubmitTools.filter(
        (t) => !t.request.isClientInitiated,
      );

      if (geminiTools.length === 0) {
        return;
      }

      // If all the tools were cancelled, don't submit a response to Gemini.
      const allToolsCancelled = geminiTools.every(
        (tc) => tc.status === "cancelled",
      );

      if (allToolsCancelled) {
        if (geminiClient) {
          // We need to manually add the function responses to the history
          // so the model knows the tools were cancelled.
          const combinedParts = geminiTools.flatMap(
            (toolCall) => toolCall.response.responseParts,
          );
          geminiClient.addHistory({
            role: "user",
            parts: combinedParts,
          });
        }

        const callIdsToMarkAsSubmitted = geminiTools.map(
          (toolCall) => toolCall.request.callId,
        );
        markToolsAsSubmitted(callIdsToMarkAsSubmitted);
        return;
      }

      const responsesToSend: Part[] = geminiTools.flatMap(
        (toolCall) => toolCall.response.responseParts,
      );
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      const prompt_ids = geminiTools.map(
        (toolCall) => toolCall.request.prompt_id,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);

      // Don't continue if model was switched due to quota error
      if (modelSwitchedFromQuotaError) {
        return;
      }

      submitQuery(
        responsesToSend,
        {
          isContinuation: true,
        },
        prompt_ids[0],
      );
    },
    [
      isResponding,
      submitQuery,
      markToolsAsSubmitted,
      geminiClient,
      performMemoryRefresh,
      modelSwitchedFromQuotaError,
      addItem,
    ],
  );

  const pendingHistoryItems = useMemo(
    () =>
      [pendingHistoryItemRef.current, pendingToolCallGroupDisplay].filter(
        (i) => i !== undefined && i !== null,
      ),
    [pendingHistoryItemRef, pendingToolCallGroupDisplay],
  );

  useEffect(() => {
    const saveRestorableToolCalls = async () => {
      if (!config.getCheckpointingEnabled()) {
        return;
      }
      const restorableToolCalls = toolCalls.filter(
        (toolCall) =>
          (toolCall.request.name === "edit" ||
            toolCall.request.name === "write_file") &&
          toolCall.status === "awaiting_approval",
      );

      if (restorableToolCalls.length > 0) {
        const checkpointDir = storage.getProjectTempCheckpointsDir();

        if (!checkpointDir) {
          return;
        }

        try {
          await fs.mkdir(checkpointDir, { recursive: true });
        } catch (error) {
          if (!isNodeError(error) || error.code !== "EEXIST") {
            onDebugMessage(
              `Failed to create checkpoint directory: ${getErrorMessage(error)}`,
            );
            return;
          }
        }

        for (const toolCall of restorableToolCalls) {
          const filePath = toolCall.request.args["file_path"] as string;
          if (!filePath) {
            onDebugMessage(
              `Skipping restorable tool call due to missing file_path: ${toolCall.request.name}`,
            );
            continue;
          }

          try {
            if (!gitService) {
              onDebugMessage(
                `Checkpointing is enabled but Git service is not available. Failed to create snapshot for ${filePath}. Ensure Git is installed and working properly.`,
              );
              continue;
            }

            let commitHash: string | undefined;
            try {
              commitHash = await gitService.createFileSnapshot(
                `Snapshot for ${toolCall.request.name}`,
              );
            } catch (error) {
              onDebugMessage(
                `Failed to create new snapshot: ${getErrorMessage(error)}. Attempting to use current commit.`,
              );
            }

            if (!commitHash) {
              commitHash = await gitService.getCurrentCommitHash();
            }

            if (!commitHash) {
              onDebugMessage(
                `Failed to create snapshot for ${filePath}. Checkpointing may not be working properly. Ensure Git is installed and the project directory is accessible.`,
              );
              continue;
            }

            const timestamp = new Date()
              .toISOString()
              .replace(/:/g, "-")
              .replace(/\./g, "_");
            const toolName = toolCall.request.name;
            const fileName = path.basename(filePath);
            const toolCallWithSnapshotFileName = `${timestamp}-${fileName}-${toolName}.json`;
            const clientHistory = await geminiClient?.getHistory();
            const toolCallWithSnapshotFilePath = path.join(
              checkpointDir,
              toolCallWithSnapshotFileName,
            );

            await fs.writeFile(
              toolCallWithSnapshotFilePath,
              JSON.stringify(
                {
                  history,
                  clientHistory,
                  toolCall: {
                    name: toolCall.request.name,
                    args: toolCall.request.args,
                  },
                  commitHash,
                  filePath,
                },
                null,
                2,
              ),
            );
          } catch (error) {
            onDebugMessage(
              `Failed to create checkpoint for ${filePath}: ${getErrorMessage(
                error,
              )}. This may indicate a problem with Git or file system permissions.`,
            );
          }
        }
      }
    };
    saveRestorableToolCalls();
  }, [
    toolCalls,
    config,
    onDebugMessage,
    gitService,
    history,
    geminiClient,
    storage,
  ]);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
    cancelOngoingRequest,
  };
};

function buildToolCallSignature(request: ToolCallRequestInfo): string {
  return `${request.name}:${stableStringify(request.args ?? {})}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, val]) =>
        `${JSON.stringify(key)}:${stableStringify(val as unknown)}`,
    );

  return `{${entries.join(",")}}`;
}

function appendAntiRepeatHint(query: PartListUnion): PartListUnion {
  if (typeof query === "string") {
    return `${query}\n\n${ANTI_REPEAT_HINT}`;
  }

  const partsArray = Array.isArray(query) ? [...query] : [query];
  partsArray.push({ text: ANTI_REPEAT_HINT });
  return partsArray;
}

const ANTI_REPEAT_HINT =
  "[system reminder] You just repeated the same instruction/tool call multiple times. Do not repeat identical actions unless the situation has changed; continue the task with new progress.";
