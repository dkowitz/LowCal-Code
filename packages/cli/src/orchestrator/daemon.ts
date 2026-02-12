/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  getSessionContextSummary,
  getSessionHealthView,
  getSessionRecentHistory,
  getSessionStatusView,
  listSessions,
  removeSession,
  setSessionHealth,
  type SessionRecord,
  type SessionHealthState,
  type SessionHealthReason,
} from "@qwen-code/qwen-code-core";
import {
  setSessionStatus,
  startSessionRegistration,
  stopSessionRegistration,
  updateSessionDetails,
} from "../session/sessionManager.js";

const ORCHESTRATOR_PID_FILE = path.join(
  process.cwd(),
  ".lowcal",
  "orchestrator.pid",
);
const ORCHESTRATOR_STATUS_FILE = path.join(
  process.cwd(),
  ".lowcal",
  "orchestrator.status.json",
);
const ORCHESTRATOR_LOG_FILE = path.join(
  process.cwd(),
  ".lowcal",
  "orchestrator",
  "logs",
  "actions.jsonl",
);

const TICK_INTERVAL_MS = 15000;
const STALE_HEARTBEAT_MS = 2 * 60 * 1000;
const MIN_STALLED_DURATION_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const ATTEMPT_COOLDOWN_MS = 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const TARGET_MODES = new Set(["tui", "headless", "noninteractive"]);

interface AttemptState {
  attempts: number;
  window_started_at: number;
  last_attempt_at: number;
}

interface TickMetrics {
  sessions_scanned: number;
  stalled_sessions: number;
  recoveries_attempted: number;
  recoveries_succeeded: number;
}

interface OrchestratorActionRecord {
  decision_id: string;
  timestamp: string;
  policy_id: "recover_stalled_session";
  session_id: string;
  mode: string;
  attempt: number;
  evidence: Record<string, unknown>;
  action: {
    type:
      | "session.cancel_turn_api"
      | "session.restart_turn_api"
      | "session.resume_api"
      | "session.request_self_repair_api"
      | "session.resume_process"
      | "session.remove_dead_record";
    signal?: "SIGCONT";
  };
  result: {
    accepted: boolean;
    outcome: string;
    reason?: string;
  };
}

export interface OrchestratorStatus {
  running: boolean;
  pid?: number;
  started_at?: string;
  last_tick?: string;
  tick_interval_ms: number;
  policy_ids: string[];
  sessions_scanned: number;
  stalled_sessions: number;
  recoveries_attempted: number;
  recoveries_succeeded: number;
  last_action?: {
    timestamp: string;
    session_id: string;
    outcome: string;
    attempt: number;
  };
}

const attemptStateBySession = new Map<string, AttemptState>();
let daemonStartedAt = new Date().toISOString();
let lastActionRecord: OrchestratorActionRecord | undefined;
let cachedMetrics: TickMetrics = {
  sessions_scanned: 0,
  stalled_sessions: 0,
  recoveries_attempted: 0,
  recoveries_succeeded: 0,
};

interface SessionApiEnvelope {
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface SessionControlResult {
  accepted: boolean;
  action_id?: string;
  reason?: string;
}

function isTargetMode(session: SessionRecord): boolean {
  return TARGET_MODES.has(session.mode);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getAttemptState(sessionId: string, nowMs: number): AttemptState {
  const current = attemptStateBySession.get(sessionId);
  if (!current) {
    const created: AttemptState = {
      attempts: 0,
      window_started_at: nowMs,
      last_attempt_at: 0,
    };
    attemptStateBySession.set(sessionId, created);
    return created;
  }

  if (nowMs - current.window_started_at > ATTEMPT_WINDOW_MS) {
    current.attempts = 0;
    current.window_started_at = nowMs;
    current.last_attempt_at = 0;
  }

  return current;
}

async function appendActionLog(
  record: OrchestratorActionRecord,
): Promise<void> {
  await fs.mkdir(path.dirname(ORCHESTRATOR_LOG_FILE), { recursive: true });
  await fs.appendFile(
    ORCHESTRATOR_LOG_FILE,
    `${JSON.stringify(record)}\n`,
    "utf-8",
  );
}

function parseControlResult(value: unknown): SessionControlResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accepted = record["accepted"];
  if (typeof accepted !== "boolean") {
    return null;
  }
  return {
    accepted,
    action_id:
      typeof record["action_id"] === "string" ? record["action_id"] : undefined,
    reason: typeof record["reason"] === "string" ? record["reason"] : undefined,
  };
}

async function callUnixSessionApi(
  socketPath: string,
  method: string,
  authToken?: string,
  params?: Record<string, unknown>,
): Promise<SessionApiEnvelope | null> {
  return await new Promise<SessionApiEnvelope | null>((resolve) => {
    const request = {
      id: `orchestrator-${Date.now()}`,
      method,
      auth_token: authToken,
      params,
    };

    let resolved = false;
    let buffer = "";
    const socket = net.createConnection({ path: socketPath });
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(null);
      }
    }, 1500);

    const finish = (value: SessionApiEnvelope | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(value);
    };

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      if (!line) {
        finish(null);
        return;
      }

      try {
        finish(JSON.parse(line) as SessionApiEnvelope);
      } catch {
        finish(null);
      }
    });

    socket.on("error", () => finish(null));
    socket.on("end", () => finish(null));
    socket.on("close", () => finish(null));
  });
}

interface SessionApiControlAttempt {
  accepted: boolean;
  reachable: boolean;
  reason?: string;
  api_error?: string;
}

async function attemptSessionApiControl(
  socketPath: string,
  method: string,
  authToken?: string,
  params?: Record<string, unknown>,
): Promise<SessionApiControlAttempt> {
  const apiResponse = await callUnixSessionApi(socketPath, method, authToken, params);
  if (!apiResponse) {
    return {
      accepted: false,
      reachable: false,
      api_error: "api_unreachable",
    };
  }

  if (!apiResponse.ok) {
    return {
      accepted: false,
      reachable: true,
      api_error: apiResponse.error ?? "unknown_api_error",
    };
  }

  const control = parseControlResult(apiResponse.result);
  if (!control) {
    return {
      accepted: false,
      reachable: true,
      reason: "invalid_api_result",
    };
  }

  return {
    accepted: control.accepted,
    reachable: true,
    reason: control.reason,
  };
}

async function saveDaemonStatus(status: OrchestratorStatus): Promise<void> {
  await fs.mkdir(path.dirname(ORCHESTRATOR_STATUS_FILE), { recursive: true });
  await fs.writeFile(
    ORCHESTRATOR_STATUS_FILE,
    JSON.stringify(status, null, 2),
    "utf-8",
  );
}

export async function isOrchestratorRunning(): Promise<boolean> {
  try {
    const pid = parseInt(await fs.readFile(ORCHESTRATOR_PID_FILE, "utf-8"), 10);
    if (!Number.isFinite(pid)) return false;
    if (isProcessAlive(pid)) {
      return true;
    }
    await fs.unlink(ORCHESTRATOR_PID_FILE).catch(() => {});
    return false;
  } catch {
    return false;
  }
}

export async function getOrchestratorStatus(): Promise<OrchestratorStatus> {
  const running = await isOrchestratorRunning();
  let persisted: Partial<OrchestratorStatus> = {};
  if (running) {
    try {
      const raw = await fs.readFile(ORCHESTRATOR_STATUS_FILE, "utf-8");
      persisted = JSON.parse(raw) as Partial<OrchestratorStatus>;
    } catch {
      // Fallback to in-memory defaults.
    }
  }

  return {
    running,
    pid: running
      ? parseInt(await fs.readFile(ORCHESTRATOR_PID_FILE, "utf-8"), 10)
      : undefined,
    started_at: persisted.started_at ?? (running ? daemonStartedAt : undefined),
    last_tick: persisted.last_tick,
    tick_interval_ms: TICK_INTERVAL_MS,
    policy_ids: ["recover_stalled_session"],
    sessions_scanned:
      persisted.sessions_scanned ?? cachedMetrics.sessions_scanned,
    stalled_sessions:
      persisted.stalled_sessions ?? cachedMetrics.stalled_sessions,
    recoveries_attempted:
      persisted.recoveries_attempted ?? cachedMetrics.recoveries_attempted,
    recoveries_succeeded:
      persisted.recoveries_succeeded ?? cachedMetrics.recoveries_succeeded,
    last_action:
      persisted.last_action ??
      (lastActionRecord
        ? {
            timestamp: lastActionRecord.timestamp,
            session_id: lastActionRecord.session_id,
            outcome: lastActionRecord.result.outcome,
            attempt: lastActionRecord.attempt,
          }
        : undefined),
  };
}

async function attemptRecovery(
  session: SessionRecord,
  nowMs: number,
  staleMs: number,
): Promise<boolean> {
  const state = getAttemptState(session.id, nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const attemptNumber = state.attempts + 1;
  const context = await getSessionContextSummary(session.id);
  const health = await getSessionHealthView(session.id);

  const evidence: Record<string, unknown> = {
    stale_ms: staleMs,
    attempt: attemptNumber,
    max_attempts: MAX_ATTEMPTS,
  };
  if (context?.model) {
    evidence["model"] = context.model;
  }
  if (context?.approval_mode) {
    evidence["approval_mode"] = context.approval_mode;
  }
  if (health) {
    evidence["health_state"] = health.state;
    evidence["health_reason"] = health.reason;
    evidence["health_evidence"] = health.evidence;
  }

  let action: OrchestratorActionRecord["action"] = {
    type: "session.resume_process",
    signal: "SIGCONT",
  };
  let result: OrchestratorActionRecord["result"] = {
    accepted: false,
    outcome: "not_attempted",
  };

  // Check if we have a health state that indicates a specific problem
  const healthReason = health?.reason;

  // Handle loop_detected specifically - inject a prompt to break the loop
  if (healthReason === "loop_detected") {
    evidence["policy_sequence"] = ["request_self_repair_loop_break"];
    if (
      session.capabilities?.control &&
      session.api?.transport === "unix" &&
      session.api.address
    ) {
      const authToken =
        typeof session.api.auth_token === "string"
          ? session.api.auth_token
          : undefined;

      const repairAttempt = await attemptSessionApiControl(
        session.api.address,
        "session.request_self_repair",
        authToken,
        {
          prompt:
            "You appear to be stuck in a loop. Please try a different approach or ask for help.",
        },
      );
      evidence["api_request_self_repair"] = repairAttempt;

      if (repairAttempt.accepted) {
        action = { type: "session.request_self_repair_api" };
        result = {
          accepted: true,
          outcome: "session_request_self_repair_loop_accepted",
        };
        state.attempts = attemptNumber;
        state.last_attempt_at = nowMs;
        attemptStateBySession.set(session.id, state);

        const record: OrchestratorActionRecord = {
          decision_id: `orchestrator-${session.id}-${nowMs}`,
          timestamp: nowIso,
          policy_id: "recover_stalled_session",
          session_id: session.id,
          mode: session.mode,
          attempt: attemptNumber,
          evidence,
          action,
          result,
        };

        lastActionRecord = record;
        await appendActionLog(record);

        if (result.accepted) {
          await setSessionHealth(session.id, {
            state: "recovering",
            reason: "loop_remediation_attempt",
            confidence: 0.9,
            evidence: {
              ...evidence,
              last_action: result.outcome,
            },
            remediation: {
              stage: `retry_${attemptNumber}`,
              attempts: attemptNumber,
              next_eligible_at: new Date(nowMs + ATTEMPT_COOLDOWN_MS).toISOString(),
            },
          });
        }

        return result.accepted;
      }
    }
  }

  // Handle unhandled_error - inject a continue prompt
  if (healthReason === "unhandled_error") {
    evidence["policy_sequence"] = ["request_self_repair_error_continue"];
    if (
      session.capabilities?.control &&
      session.api?.transport === "unix" &&
      session.api.address
    ) {
      const authToken =
        typeof session.api.auth_token === "string"
          ? session.api.auth_token
          : undefined;

      // Get recent history for context
      const recentHistory = await getSessionRecentHistory(session.id, {
        max_items: 5,
        max_chars: 2000,
      });

      let prompt =
        "An error occurred. Please continue with your task or ask for help.";

      if (recentHistory?.items && recentHistory.items.length > 0) {
        // Include some context from the recent history
        const lastMessage = recentHistory.items[recentHistory.items.length - 1];
        if (lastMessage.content.length > 0) {
          prompt = `An error occurred. Here's what happened recently: "${lastMessage.content.substring(
            0,
            200,
          )}". Please continue.`;
        }
      }

      const repairAttempt = await attemptSessionApiControl(
        session.api.address,
        "session.request_self_repair",
        authToken,
        { prompt },
      );
      evidence["api_request_self_repair"] = repairAttempt;

      if (repairAttempt.accepted) {
        action = { type: "session.request_self_repair_api" };
        result = {
          accepted: true,
          outcome: "session_request_self_repair_error_accepted",
        };
        state.attempts = attemptNumber;
        state.last_attempt_at = nowMs;
        attemptStateBySession.set(session.id, state);

        const record: OrchestratorActionRecord = {
          decision_id: `orchestrator-${session.id}-${nowMs}`,
          timestamp: nowIso,
          policy_id: "recover_stalled_session",
          session_id: session.id,
          mode: session.mode,
          attempt: attemptNumber,
          evidence,
          action,
          result,
        };

        lastActionRecord = record;
        await appendActionLog(record);

        if (result.accepted) {
          await setSessionHealth(session.id, {
            state: "recovering",
            reason: "error_remediation_attempt",
            confidence: 0.9,
            evidence: {
              ...evidence,
              last_action: result.outcome,
            },
            remediation: {
              stage: `retry_${attemptNumber}`,
              attempts: attemptNumber,
              next_eligible_at: new Date(nowMs + ATTEMPT_COOLDOWN_MS).toISOString(),
            },
          });
        }

        return result.accepted;
      }
    }
  }

  // If request_self_repair failed or wasn't applicable, fall back to old recovery sequence

  if (!isProcessAlive(session.pid)) {
    await removeSession(session.id);
    action = {
      type: "session.remove_dead_record",
    };
    result = {
      accepted: true,
      outcome: "removed_dead_session_record",
    };
  } else {
    let recoveredViaApi = false;
    if (
      session.capabilities?.control &&
      session.api?.transport === "unix" &&
      session.api.address
    ) {
      evidence["api_endpoint"] = "unix";
      evidence["policy_sequence"] = [
        "session.cancel_turn",
        "session.restart_turn",
        "session.resume",
        "sigcont_fallback",
      ];
      const authToken =
        typeof session.api.auth_token === "string"
          ? session.api.auth_token
          : undefined;

      const cancelAttempt = await attemptSessionApiControl(
        session.api.address,
        "session.cancel_turn",
        authToken,
      );
      evidence["api_cancel_turn"] = cancelAttempt;

      if (cancelAttempt.reachable) {
        const restartAttempt = await attemptSessionApiControl(
          session.api.address,
          "session.restart_turn",
          authToken,
        );
        evidence["api_restart_turn"] = restartAttempt;

        if (restartAttempt.accepted) {
          action = { type: "session.restart_turn_api" };
          result = {
            accepted: true,
            outcome: "session_restart_turn_api_accepted",
          };
          recoveredViaApi = true;
        } else {
          const resumeAttempt = await attemptSessionApiControl(
            session.api.address,
            "session.resume",
            authToken,
          );
          evidence["api_resume"] = resumeAttempt;
          if (resumeAttempt.accepted) {
            action = { type: "session.resume_api" };
            result = {
              accepted: true,
              outcome: "session_resume_api_accepted",
            };
            recoveredViaApi = true;
          }
        }
      }
    }

    if (!recoveredViaApi) {
      try {
        process.kill(session.pid, "SIGCONT");
        result = {
          accepted: true,
          outcome: "sent_sigcont",
        };
      } catch (error) {
        result = {
          accepted: false,
          outcome: "sigcont_failed",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  state.attempts = attemptNumber;
  state.last_attempt_at = nowMs;
  attemptStateBySession.set(session.id, state);

  const record: OrchestratorActionRecord = {
    decision_id: `orchestrator-${session.id}-${nowMs}`,
    timestamp: nowIso,
    policy_id: "recover_stalled_session",
    session_id: session.id,
    mode: session.mode,
    attempt: attemptNumber,
    evidence,
    action,
    result,
  };

  lastActionRecord = record;
  await appendActionLog(record);

  if (result.accepted && action.type !== "session.remove_dead_record") {
    // Determine the appropriate state based on what we tried
    let newState: SessionHealthState = "stalled";
    let newReason: SessionHealthReason = "heartbeat_stale";

    if (
      healthReason === "loop_detected" ||
      healthReason === "unhandled_error"
    ) {
      // If we were in a loop or error state, stay in recovering
      newState = "recovering";
      newReason =
        healthReason === "loop_detected"
          ? "loop_remediation_attempt"
          : "error_remediation_attempt";
    }

    await setSessionHealth(session.id, {
      state: newState,
      reason: newReason,
      confidence: 0.9,
      evidence: {
        ...evidence,
        last_action: result.outcome,
      },
      remediation: {
        stage: `retry_${attemptNumber}`,
        attempts: attemptNumber,
        next_eligible_at: new Date(nowMs + ATTEMPT_COOLDOWN_MS).toISOString(),
      },
    });
  }

  return result.accepted;
}

async function evaluateSession(
  session: SessionRecord,
  nowMs: number,
  metrics: TickMetrics,
): Promise<void> {
  if (!isTargetMode(session)) {
    return;
  }
  metrics.sessions_scanned += 1;

  const status = await getSessionStatusView(session.id);
  if (!status) return;

  const lastSeenMs = Date.parse(status.last_seen);
  if (!Number.isFinite(lastSeenMs)) return;
  const staleMs = nowMs - lastSeenMs;

  // Check for health states that require immediate recovery
  const health = await getSessionHealthView(session.id);
  const healthReason = health?.reason;

  // If we have a loop_detected or unhandled_error, try to recover immediately
  // without waiting for heartbeat staleness
  if (healthReason === "loop_detected" || healthReason === "unhandled_error") {
    metrics.stalled_sessions += 1;
    const state = getAttemptState(session.id, nowMs);
    const nextEligibleAt = state.last_attempt_at + ATTEMPT_COOLDOWN_MS;

    // Only attempt recovery if cooldown has passed
    if (nowMs >= nextEligibleAt && state.attempts < MAX_ATTEMPTS) {
      metrics.recoveries_attempted += 1;
      const accepted = await attemptRecovery(session, nowMs, staleMs);
      if (accepted) {
        metrics.recoveries_succeeded += 1;
      }
    }
    return;
  }

  if (staleMs < STALE_HEARTBEAT_MS) {
    const sessionHealth = await getSessionHealthView(session.id);
    if (
      sessionHealth &&
      (sessionHealth.state === "stalled" ||
        sessionHealth.state === "error" ||
        sessionHealth.state === "recovering" ||
        sessionHealth.state === "loop_fault")
    ) {
      await setSessionHealth(session.id, {
        state: "ok",
        confidence: 1,
        evidence: {
          recovered_at: new Date(nowMs).toISOString(),
        },
      });
    }
    attemptStateBySession.delete(session.id);
    return;
  }

  metrics.stalled_sessions += 1;
  const sessionHealth = await getSessionHealthView(session.id);
  const healthFirstSeenMs = Number.isFinite(
    Date.parse(sessionHealth?.first_seen ?? ""),
  )
    ? Date.parse(sessionHealth?.first_seen ?? "")
    : nowMs;
  const stalledDurationMs = nowMs - healthFirstSeenMs;

  // If the session is in recovering state, give it more time before attempting again
  if (sessionHealth?.state === "recovering") {
    const remediation = sessionHealth.remediation;
    if (remediation?.next_eligible_at) {
      const nextEligibleAt = Date.parse(remediation.next_eligible_at);
      if (Number.isFinite(nextEligibleAt) && nowMs < nextEligibleAt) {
        // Still in cooldown period, don't attempt recovery yet
        return;
      }
    }
  }

  const state = getAttemptState(session.id, nowMs);
  const nextEligibleAt = state.last_attempt_at + ATTEMPT_COOLDOWN_MS;

  await setSessionHealth(session.id, {
    state: "stalled",
    reason: "heartbeat_stale",
    confidence: 0.9,
    evidence: {
      last_seen_age_ms: staleMs,
      stalled_duration_ms: stalledDurationMs,
    },
    remediation: {
      stage: state.attempts === 0 ? "pending" : `retry_${state.attempts}`,
      attempts: state.attempts,
      next_eligible_at: new Date(nextEligibleAt).toISOString(),
    },
  });

  if (stalledDurationMs < MIN_STALLED_DURATION_MS) {
    return;
  }

  if (state.attempts >= MAX_ATTEMPTS) {
    await setSessionHealth(session.id, {
      state: "error",
      reason: "no_progress_timeout",
      confidence: 0.95,
      evidence: {
        last_seen_age_ms: staleMs,
        stalled_duration_ms: stalledDurationMs,
      },
      remediation: {
        stage: "exhausted",
        attempts: state.attempts,
      },
    });
    return;
  }

  if (nowMs < nextEligibleAt) {
    return;
  }

  metrics.recoveries_attempted += 1;
  const accepted = await attemptRecovery(session, nowMs, staleMs);
  if (accepted) {
    metrics.recoveries_succeeded += 1;
  }
}

async function tick(): Promise<void> {
  const nowMs = Date.now();
  const sessions = await listSessions();
  const targets = sessions.filter((session) => session.mode !== "orchestrator");

  const metrics: TickMetrics = {
    sessions_scanned: 0,
    stalled_sessions: 0,
    recoveries_attempted: 0,
    recoveries_succeeded: 0,
  };

  for (const session of targets) {
    await evaluateSession(session, nowMs, metrics);
  }

  cachedMetrics = metrics;
  const status: OrchestratorStatus = {
    running: true,
    pid: process.pid,
    started_at: daemonStartedAt,
    last_tick: new Date(nowMs).toISOString(),
    tick_interval_ms: TICK_INTERVAL_MS,
    policy_ids: ["recover_stalled_session"],
    sessions_scanned: metrics.sessions_scanned,
    stalled_sessions: metrics.stalled_sessions,
    recoveries_attempted: metrics.recoveries_attempted,
    recoveries_succeeded: metrics.recoveries_succeeded,
    last_action: lastActionRecord
      ? {
          timestamp: lastActionRecord.timestamp,
          session_id: lastActionRecord.session_id,
          outcome: lastActionRecord.result.outcome,
          attempt: lastActionRecord.attempt,
        }
      : undefined,
  };

  await updateSessionDetails({
    sessions_scanned: metrics.sessions_scanned,
    stalled_sessions: metrics.stalled_sessions,
    recoveries_attempted: metrics.recoveries_attempted,
    recoveries_succeeded: metrics.recoveries_succeeded,
    policy_ids: ["recover_stalled_session"],
  });
  await setSessionStatus(metrics.stalled_sessions > 0 ? "working" : "idle");
  await saveDaemonStatus(status);
}

function registerShutdownHandlers(): void {
  const shutdown = async () => {
    await fs.unlink(ORCHESTRATOR_PID_FILE).catch(() => {});
    await stopSessionRegistration();
  };

  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("exit", () => {
    void shutdown();
  });
}

async function runDaemon(): Promise<void> {
  daemonStartedAt = new Date().toISOString();
  registerShutdownHandlers();

  await startSessionRegistration({
    id: `orchestrator-${process.pid}`,
    mode: "orchestrator",
    status: "idle",
    details: {
      policy_ids: ["recover_stalled_session"],
      tick_interval_ms: TICK_INTERVAL_MS,
    },
    capabilities: {
      observe: true,
      control: true,
      interact: false,
    },
  });

  await fs.mkdir(path.dirname(ORCHESTRATOR_PID_FILE), { recursive: true });
  await fs.writeFile(ORCHESTRATOR_PID_FILE, String(process.pid), "utf-8");

  await tick();
  setInterval(() => {
    tick().catch((error) => {
      console.error("[Orchestrator] tick failed:", error);
    });
  }, TICK_INTERVAL_MS);
  setInterval(() => {
    // Keep process alive when detached.
  }, 10000);
}

export async function stopOrchestrator(): Promise<boolean> {
  try {
    const pid = parseInt(await fs.readFile(ORCHESTRATOR_PID_FILE, "utf-8"), 10);
    if (!Number.isFinite(pid)) return false;

    try {
      process.kill(pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (isProcessAlive(pid)) {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      return false;
    }

    await fs.unlink(ORCHESTRATOR_PID_FILE).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function startOrchestrator(): Promise<boolean> {
  if (await isOrchestratorRunning()) {
    return false;
  }

  const daemonPath = fileURLToPath(import.meta.url);
  const child = spawn("node", [daemonPath, "--daemon"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });

  child.unref();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return await isOrchestratorRunning();
}

const isMainModule =
  !!process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.includes("--daemon")) {
    runDaemon().catch((error) => {
      console.error("[Orchestrator] daemon error:", error);
      process.exit(1);
    });
  } else if (args.includes("--status")) {
    getOrchestratorStatus().then((status) => {
      console.log(JSON.stringify(status, null, 2));
    });
  } else if (args.includes("--start")) {
    startOrchestrator().then((started) => {
      if (!started) {
        process.exit(1);
      }
      console.log("[Orchestrator] started");
    });
  } else if (args.includes("--stop")) {
    stopOrchestrator().then((stopped) => {
      if (!stopped) {
        process.exit(1);
      }
      console.log("[Orchestrator] stopped");
    });
  } else {
    console.log("Usage: node daemon.ts [--daemon|--start|--stop|--status]");
  }
}
