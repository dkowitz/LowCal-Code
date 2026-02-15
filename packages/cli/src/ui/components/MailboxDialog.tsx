/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listLaunchTaskStates,
  reconcileLaunchTaskState,
  type LaunchTaskStateRecord,
} from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from "./shared/RadioButtonSelect.js";
import {
  clearMailboxMessages,
  getMailboxPath,
  loadMailboxPayloadText,
  mailboxMessageTaskId,
  readMailboxMessages,
  sortMailboxMessages,
  summarizeMailboxPayload,
  type SessionMailboxMessage,
} from "../utils/mailbox.js";

type FocusSection = "received" | "pending" | "actions" | "preview";
type SelectedTarget =
  | { type: "received"; key: string }
  | { type: "pending"; taskId: string };

interface MailboxDialogProps {
  baseDir: string;
  sessionId: string;
  onExit: () => void;
  onUsePayload: (payload: string) => Promise<void>;
}

interface ReceivedEntry {
  key: string;
  message: SessionMailboxMessage;
  taskId: string;
  status: string;
  timeText: string;
  summary: string;
}

interface PendingEntry {
  taskId: string;
  status: string;
  mode: string;
  activityText: string;
  templateId?: string;
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "unknown-time";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown-time";
  }
  return parsed.toLocaleString();
}

function buildReceivedPayloadMessage(
  index: number,
  entry: ReceivedEntry,
  payload: string,
): string {
  return [
    `### Mailbox Payload [${index}]`,
    `- Task: \`${entry.taskId}\``,
    `- Status: \`${entry.status}\``,
    `- Time: ${entry.timeText}`,
    "",
    payload,
  ].join("\n");
}

function toPendingEntries(records: LaunchTaskStateRecord[]): PendingEntry[] {
  return [...records]
    .sort((a, b) => {
      const left = Date.parse(
        b.last_heartbeat ?? b.started_at ?? b.created_at ?? "1970-01-01",
      );
      const right = Date.parse(
        a.last_heartbeat ?? a.started_at ?? a.created_at ?? "1970-01-01",
      );
      return left - right;
    })
    .map((record) => ({
      taskId: record.task_id,
      status: record.status,
      mode: record.execution_mode_actual ?? record.execution_mode_requested ?? "default",
      activityText: formatDateTime(
        record.last_heartbeat ?? record.started_at ?? record.created_at,
      ),
      templateId: record.template_id,
    }));
}

function toPreviewLines(
  text: string,
  maxLines: number,
  maxLineLength: number,
): string[] {
  if (!text) {
    return ["(empty payload)"];
  }

  const sourceLines = text.replace(/\r\n/g, "\n").split("\n");
  const limited: string[] = [];

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

export function MailboxDialog({
  baseDir,
  sessionId,
  onExit,
  onUsePayload,
}: MailboxDialogProps): React.JSX.Element {
  const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
  const [focusSection, setFocusSection] = useState<FocusSection>("received");
  const [receivedMessages, setReceivedMessages] = useState<SessionMailboxMessage[]>(
    [],
  );
  const [pendingTasks, setPendingTasks] = useState<PendingEntry[]>([]);
  const [selectedReceivedKey, setSelectedReceivedKey] = useState<string | null>(
    null,
  );
  const [selectedPendingTaskId, setSelectedPendingTaskId] = useState<string | null>(
    null,
  );
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(null);
  const [previewText, setPreviewText] = useState<string>(
    "Select a mailbox item to preview its payload.",
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  const mailboxPath = useMemo(
    () => getMailboxPath(baseDir, sessionId),
    [baseDir, sessionId],
  );

  const receivedEntries = useMemo<ReceivedEntry[]>(() => {
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
    if (
      selectedReceivedKey &&
      receivedEntries.some((entry) => entry.key === selectedReceivedKey)
    ) {
      return selectedReceivedKey;
    }
    return receivedEntries[0]?.key ?? null;
  }, [selectedReceivedKey, receivedEntries]);

  const effectivePendingTaskId = useMemo(() => {
    if (
      selectedPendingTaskId &&
      pendingTasks.some((entry) => entry.taskId === selectedPendingTaskId)
    ) {
      return selectedPendingTaskId;
    }
    return pendingTasks[0]?.taskId ?? null;
  }, [selectedPendingTaskId, pendingTasks]);

  const effectiveSelectedTarget = useMemo<SelectedTarget | null>(() => {
    if (selectedTarget?.type === "received") {
      if (receivedEntries.some((entry) => entry.key === selectedTarget.key)) {
        return selectedTarget;
      }
    } else if (selectedTarget?.type === "pending") {
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
    const index = pendingTasks.findIndex(
      (entry) => entry.taskId === effectivePendingTaskId,
    );
    return index >= 0 ? index : 0;
  }, [effectivePendingTaskId, pendingTasks]);

  const receivedItems: Array<RadioSelectItem<string>> = useMemo(
    () =>
      receivedEntries.map((entry) => ({
        value: entry.key,
        label: `${entry.taskId} [${entry.status}] - ${entry.summary}`,
      })),
    [receivedEntries],
  );

  const pendingItems: Array<RadioSelectItem<string>> = useMemo(
    () =>
      pendingTasks.map((entry) => ({
        value: entry.taskId,
        label: `${entry.taskId} (${entry.status}, ${entry.mode}, ${entry.activityText})`,
      })),
    [pendingTasks],
  );

  const reloadMailbox = useCallback(
    async (options?: { status?: string; background?: boolean }) => {
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
      } catch (error) {
        setErrorMessage(
          `Failed to load mailbox: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (!options?.background) {
          setIsBusy(false);
        }
        setIsLoading(false);
      }
    },
    [baseDir, mailboxPath, sessionId],
  );

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
      const entry = pendingTasks.find(
        (item) => item.taskId === effectiveSelectedTarget.taskId,
      );
      if (!entry) {
        setPreviewText("No pending task selected.");
      } else {
        const templateInfo = entry.templateId
          ? `\nTemplate: ${entry.templateId}`
          : "";
        setPreviewText(
          [
            "Pending Task",
            `Task: ${entry.taskId}`,
            `Status: ${entry.status}`,
            `Mode: ${entry.mode}`,
            `Last Activity: ${entry.activityText}${templateInfo}`,
          ].join("\n"),
        );
      }
      setIsLoadingPreview(false);
      return () => {
        cancelled = true;
      };
    }

    const entry = receivedEntries.find(
      (item) => item.key === effectiveSelectedTarget.key,
    );
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
      } catch (error) {
        if (cancelled) {
          return;
        }
        setPreviewText(
          `Unable to load payload: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
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

    const entry = receivedEntries.find(
      (item) => item.key === effectiveSelectedTarget.key,
    );
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
    } catch (error) {
      setErrorMessage(
        `Failed to use payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsBusy(false);
    }
  }, [effectiveSelectedTarget, receivedEntries, onUsePayload, onExit]);

  const actionItems: Array<RadioSelectItem<string>> = [
    { label: "Use Selected Payload", value: "use" },
    { label: "Refresh", value: "refresh" },
    { label: "Clear Received", value: "clear" },
    { label: "Close", value: "close" },
  ];

  const handleActionSelect = useCallback(
    (value: string) => {
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
          } catch (error) {
            setErrorMessage(
              `Failed to clear mailbox: ${error instanceof Error ? error.message : String(error)}`,
            );
          } finally {
            setIsBusy(false);
          }
        })();
        return;
      }

      onExit();
    },
    [
      isBusy,
      handleUseSelectedPayload,
      reloadMailbox,
      mailboxPath,
      sessionId,
      onExit,
    ],
  );

  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onExit();
        return;
      }

      if (key.name === "tab") {
        const order: FocusSection[] = ["received", "pending", "actions", "preview"];
        setFocusSection((current) => {
          const currentIndex = order.indexOf(current);
          const nextIndex = key.shift
            ? (currentIndex - 1 + order.length) % order.length
            : (currentIndex + 1) % order.length;
          return order[nextIndex]!;
        });
      }
    },
    { isActive: true },
  );

  const listMaxItems = Math.max(6, Math.min(12, Math.floor(terminalRows * 0.28)));
  const actionMaxItems = Math.max(4, Math.min(8, Math.floor(terminalRows * 0.2)));
  const previewMaxLines = Math.max(
    8,
    Math.min(20, Math.floor(terminalRows * 0.33)),
  );
  const previewMaxLineLength = Math.max(
    48,
    Math.min(120, Math.floor(terminalColumns * 0.44)),
  );
  const previewLines = useMemo(
    () => toPreviewLines(previewText, previewMaxLines, previewMaxLineLength),
    [previewText, previewMaxLines, previewMaxLineLength],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      width="100%"
      padding={1}
      gap={1}
    >
      <Box flexDirection="row" gap={1}>
        <Box
          flexDirection="column"
          width="50%"
          borderStyle="single"
          borderColor={
            focusSection === "received" ? Colors.AccentBlue : Colors.Gray
          }
          paddingX={1}
        >
          <Text bold={focusSection === "received"}>
            {focusSection === "received" ? "> " : "  "}Received ({receivedEntries.length})
          </Text>
          {isLoading ? (
            <Text color={Colors.Gray}>Loading mailbox...</Text>
          ) : receivedItems.length === 0 ? (
            <Text color={Colors.Gray}>No received payloads yet.</Text>
          ) : (
            <RadioButtonSelect
              items={receivedItems}
              initialIndex={selectedReceivedIndex}
              onSelect={(key) => {
                setSelectedReceivedKey(key);
                setSelectedTarget({ type: "received", key });
              }}
              onHighlight={(key) => {
                setSelectedReceivedKey(key);
                setSelectedTarget({ type: "received", key });
              }}
              isFocused={focusSection === "received"}
              maxItemsToShow={listMaxItems}
              showScrollArrows={true}
              key={`received-${receivedItems.length}-${selectedReceivedIndex}`}
            />
          )}
        </Box>

        <Box
          flexDirection="column"
          width="50%"
          borderStyle="single"
          borderColor={focusSection === "pending" ? Colors.AccentBlue : Colors.Gray}
          paddingX={1}
        >
          <Text bold={focusSection === "pending"}>
            {focusSection === "pending" ? "> " : "  "}Pending ({pendingTasks.length})
          </Text>
          {isLoading ? (
            <Text color={Colors.Gray}>Loading pending tasks...</Text>
          ) : pendingItems.length === 0 ? (
            <Text color={Colors.Gray}>No queued/running tasks.</Text>
          ) : (
            <RadioButtonSelect
              items={pendingItems}
              initialIndex={selectedPendingIndex}
              onSelect={(taskId) => {
                setSelectedPendingTaskId(taskId);
                setSelectedTarget({ type: "pending", taskId });
              }}
              onHighlight={(taskId) => {
                setSelectedPendingTaskId(taskId);
                setSelectedTarget({ type: "pending", taskId });
              }}
              isFocused={focusSection === "pending"}
              maxItemsToShow={listMaxItems}
              showScrollArrows={true}
              key={`pending-${pendingItems.length}-${selectedPendingIndex}`}
            />
          )}
        </Box>
      </Box>

      <Box flexDirection="row" gap={1}>
        <Box
          flexDirection="column"
          width="50%"
          borderStyle="single"
          borderColor={focusSection === "actions" ? Colors.AccentBlue : Colors.Gray}
          paddingX={1}
        >
          <Text bold={focusSection === "actions"}>
            {focusSection === "actions" ? "> " : "  "}Actions
          </Text>
          <RadioButtonSelect
            items={actionItems}
            initialIndex={0}
            onSelect={handleActionSelect}
            isFocused={focusSection === "actions"}
            maxItemsToShow={actionMaxItems}
            showScrollArrows={true}
            key={`mailbox-actions-${isBusy ? "busy" : "idle"}`}
          />
          {statusMessage && <Text color={Colors.AccentGreen}>{statusMessage}</Text>}
          {errorMessage && <Text color={Colors.AccentRed}>{errorMessage}</Text>}
        </Box>

        <Box
          flexDirection="column"
          width="50%"
          borderStyle="single"
          borderColor={focusSection === "preview" ? Colors.AccentBlue : Colors.Gray}
          paddingX={1}
        >
          <Text bold={focusSection === "preview"}>
            {focusSection === "preview" ? "> " : "  "}Preview
          </Text>
          {isLoadingPreview ? (
            <Text color={Colors.Gray}>Loading payload preview...</Text>
          ) : (
            previewLines.map((line, index) => (
              <Text key={`preview-${index}`} wrap="truncate-end">
                {line || " "}
              </Text>
            ))
          )}
        </Box>
      </Box>

      <Text color={Colors.Gray}>
        Tab cycles panels: Received, Pending, Actions, Preview. Enter selects. Esc
        closes.
      </Text>
    </Box>
  );
}
