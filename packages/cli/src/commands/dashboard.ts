/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI command for viewing a dashboard of sessions and scheduler status
 */

import type { CommandModule, Argv } from "yargs";
import stripAnsiLib from "strip-ansi";

import {
  listSessions,
  pruneStaleSessions,
  killSession,
  listJobs,
  getJob,
  deleteJob,
  resetJob,
  type SessionRecord,
  type Job,
  type JobExecutionMode,
} from "@qwen-code/qwen-code-core";
import { DEFAULT_SESSION_TTL_MS } from "../session/sessionManager.js";

import {
  isDaemonRunning,
  getDaemonStatus,
  startDaemon,
  stopDaemon,
  pauseJob as daemonPauseJob,
  resumeJob as daemonResumeJob,
} from "../scheduler/daemon.js";

import { loadSettings } from "../config/settings.js";

type DashboardArgs = {
  ttl?: number;
  watch?: boolean;
  interval?: number;
};

type DashboardAction = "delete" | "reset" | "pause" | "resume" | "killSession";

const DASHBOARD_SECTION_INNER_WIDTH = 77;
const DASHBOARD_SHORTCUTS_INNER_WIDTH = 80;
const ALT_SCREEN_ON = "\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l";
const ALT_SCREEN_OFF = "\x1b[?25h\x1b[?1049l";

function getTtlMs(ttlSeconds?: number): number {
  if (!ttlSeconds || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return DEFAULT_SESSION_TTL_MS;
  }
  return ttlSeconds * 1000;
}

function getIntervalMs(intervalSeconds?: number): number {
  if (
    !intervalSeconds ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds <= 0
  ) {
    return 2000;
  }
  return intervalSeconds * 1000;
}

function stripAnsi(value: string): string {
  return stripAnsiLib(value);
}

function fitToWidth(value: string, width: number): string {
  const visible = stripAnsi(value);
  if (visible.length <= width) {
    return value;
  }
  const truncated = visible.slice(0, Math.max(0, width - 1));
  return `${truncated}…`;
}

function padToWidth(value: string, width: number): string {
  const fitted = fitToWidth(value, width);
  const padding = Math.max(0, width - stripAnsi(fitted).length);
  return `${fitted}${" ".repeat(padding)}`;
}

function printBoxLine(value: string, width: number): void {
  console.log(`│ ${padToWidth(value, width)} │`);
}

function printBoxBlock(lines: string[], width: number): void {
  for (const line of lines) {
    printBoxLine(line, width);
  }
}

function normalizeExecutionMode(
  value: unknown,
): JobExecutionMode | "default" | null {
  const EXECUTION_MODE_VALUES = new Set<JobExecutionMode | "default">([
    "headless",
    "zellij_tab",
    "default",
  ]);
  if (typeof value !== "string") return null;
  if (EXECUTION_MODE_VALUES.has(value as JobExecutionMode | "default")) {
    return value as JobExecutionMode | "default";
  }
  return null;
}

function getDefaultExecutionMode(): JobExecutionMode {
  const settings = loadSettings(process.cwd());
  const modeFromSettings = normalizeExecutionMode(
    settings.merged.scheduler?.executionMode,
  );
  if (modeFromSettings === "default" || modeFromSettings === null) {
    return "headless";
  }
  return modeFromSettings;
}

function sortSessionsForDisplay(
  sessions: SessionRecord[],
  ttlMs: number,
  now: number,
): SessionRecord[] {
  return [...sessions].sort((a, b) => {
    const aLast = Date.parse(a.last_seen);
    const bLast = Date.parse(b.last_seen);
    const aStale = Number.isFinite(aLast) && now - aLast > ttlMs;
    const bStale = Number.isFinite(bLast) && now - bLast > ttlMs;
    const aRank = aStale ? 2 : a.status === "working" ? 0 : 1;
    const bRank = bStale ? 2 : b.status === "working" ? 0 : 1;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    if (Number.isFinite(aLast) && Number.isFinite(bLast)) {
      return bLast - aLast;
    }
    return 0;
  });
}

function sortJobsForDisplay(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function formatSession(
  session: SessionRecord,
  ttlMs: number,
  now: number,
): string {
  const lastSeen = Date.parse(session.last_seen);
  const ageMs = Number.isFinite(lastSeen) ? now - lastSeen : Number.NaN;
  const isStale = Number.isFinite(ageMs) && ageMs > ttlMs;
  const statusLabel = isStale ? "stale" : session.status;
  const statusColor = isStale
    ? "\x1b[31m"
    : session.status === "working"
      ? "\x1b[33m"
      : "\x1b[32m";
  const reset = "\x1b[0m";
  const details = session.details ?? {};
  const jobId =
    typeof details["job_id"] === "string" ? details["job_id"] : undefined;
  const activeExecutions =
    typeof details["active_executions"] === "number"
      ? details["active_executions"]
      : undefined;

  const parts = [
    `${statusColor}${statusLabel.toUpperCase()}${reset} ${session.id}`,
    `  mode: ${session.mode}`,
    `  pid: ${session.pid}`,
    `  cwd: ${session.cwd}`,
    `  started: ${new Date(session.started_at).toLocaleString()}`,
    `  last_seen: ${new Date(session.last_seen).toLocaleString()}`,
  ];
  if (jobId) {
    parts.push(`  job_id: ${jobId}`);
  }
  if (typeof activeExecutions === "number") {
    parts.push(`  active_executions: ${activeExecutions}`);
  }
  return parts.join("\n");
}

function formatJob(job: Job, defaultMode: JobExecutionMode): string {
  const statusIcon = job.enabled ? "🟢" : "🔴";
  const statusText = job.status === "running" ? " (running)" : "";
  const effectiveMode = job.execution_mode ?? defaultMode;
  const modeLabel =
    job.execution_mode === undefined
      ? `${effectiveMode} (default)`
      : effectiveMode;

  let output = `${statusIcon} ${job.id}${statusText}\n`;
  output += `   Schedule: ${job.schedule}\n`;
  output += `   Next run: ${
    job.next_run
      ? new Date(job.next_run).toLocaleString()
      : "Not scheduled"
  }\n`;
  output += `   Last run: ${
    job.last_run
      ? new Date(job.last_run).toLocaleString()
      : "Never"
  }\n`;
  output += `   Runs: ${job.run_count} successful, ${job.error_count} failed\n`;
  output += `   Execution: ${modeLabel}\n`;

  if (job.description) {
    output += `   ${job.description}\n`;
  }

  return output;
}

function getActionPrompt(action: DashboardAction): string {
  const prompts: Record<DashboardAction, string> = {
    delete: "\nEnter Job # to delete: ",
    reset: "\nEnter Job # to reset: ",
    pause: "\nEnter Job # to pause: ",
    resume: "\nEnter Job # to resume: ",
    killSession: "\nEnter Session # to kill: ",
  };
  return prompts[action];
}

function getActionVerb(action: DashboardAction): string {
  const verbs: Record<DashboardAction, string> = {
    delete: "delete job",
    reset: "reset job",
    pause: "pause job",
    resume: "resume job",
    killSession: "kill session",
  };
  return verbs[action];
}

async function renderDashboard(
  sessions: SessionRecord[],
  jobs: Job[],
  ttlMs: number,
  intervalMs: number,
  now: number,
  actionNotice?: string,
): Promise<void> {
  const defaultMode = getDefaultExecutionMode();

  // Clear screen and move cursor to top
  process.stdout.write("\x1b[2J\x1b[H");

  // Header
  console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                           LowCal Dashboard                                    ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
  console.log();

  // Scheduler Status
  const daemonRunning = await isDaemonRunning();
  console.log("┌─ Scheduler Status ────────────────────────────────────────────────────────────┐");
  const daemonStatusText = daemonRunning ? "🟢 Running" : "🔴 Not running";
  printBoxLine(`Daemon: ${daemonStatusText}`, DASHBOARD_SECTION_INNER_WIDTH);
  if (daemonRunning) {
    const status = await getDaemonStatus();
    printBoxLine(`PID: ${status.pid}`, DASHBOARD_SECTION_INNER_WIDTH);
    printBoxLine(
      `Active executions: ${status.active_executions}`,
      DASHBOARD_SECTION_INNER_WIDTH,
    );
  }
  console.log("└───────────────────────────────────────────────────────────────────────────────┘");
  console.log();

  // Sessions Section with numeric IDs
  const sessionsHeader = `┌─ Active Sessions (${sessions.length} total) ─────────────────────────────────────────────────────────┐`;
  console.log(sessionsHeader);
  if (sessions.length === 0) {
    printBoxLine("No active sessions.", DASHBOARD_SECTION_INNER_WIDTH);
  } else {
    for (let idx = 0; idx < sessions.length; idx++) {
      const session = sessions[idx];
      const lines = formatSession(session, ttlMs, now).split("\n");
      if (lines.length > 0) {
        lines[0] = `[${idx + 1}] ${lines[0]}`;
      }
      printBoxBlock(lines, DASHBOARD_SECTION_INNER_WIDTH);
      console.log("├───────────────────────────────────────────────────────────────────────────────┤");
    }
  }
  console.log("└───────────────────────────────────────────────────────────────────────────────┘");
  console.log();

  // Jobs Section with numeric IDs
  const jobsHeader = `┌─ Scheduled Jobs (${jobs.length} total) ─────────────────────────────────────────────────────────┐`;
  console.log(jobsHeader);
  if (jobs.length === 0) {
    printBoxLine("No scheduled jobs.", DASHBOARD_SECTION_INNER_WIDTH);
  } else {
    for (let idx = 0; idx < jobs.length; idx++) {
      const job = jobs[idx];
      const lines = formatJob(job, defaultMode).split("\n");
      if (lines.length > 0) {
        const statusIcon = job.enabled ? "🟢" : "🔴";
        const statusText = job.status === "running" ? " (running)" : "";
        lines[0] = `${statusIcon} [${idx + 1}] ${job.id}${statusText}`;
      }
      printBoxBlock(lines, DASHBOARD_SECTION_INNER_WIDTH);
      console.log("├───────────────────────────────────────────────────────────────────────────────┤");
    }
  }
  console.log("└───────────────────────────────────────────────────────────────────────────────┘");
  console.log();

  // Footer with helper info
  const intervalSec = Math.round(intervalMs / 1000);
  console.log(
    `LowCal Dashboard (refresh ${intervalSec}s) - press Ctrl+C to exit`,
  );
  console.log();
  console.log("┌─ Keyboard Shortcuts ─────────────────────────────────────────────────────────────┐");
  printBoxLine(
    "[p] prune stale sessions   | [s] start daemon   | [t] stop daemon",
    DASHBOARD_SHORTCUTS_INNER_WIDTH,
  );
  printBoxLine(
    "[d] delete job <#num>      | [r] reset job <#num>",
    DASHBOARD_SHORTCUTS_INNER_WIDTH,
  );
  printBoxLine(
    "[a] pause job <#num>       | [e] resume job <#num>",
    DASHBOARD_SHORTCUTS_INNER_WIDTH,
  );
  printBoxLine(
    "[k] kill session <#num>    | [Esc] cancel action",
    DASHBOARD_SHORTCUTS_INNER_WIDTH,
  );
  console.log("└──────────────────────────────────────────────────────────────────────────────────┘");

  if (actionNotice) {
    console.log();
    console.log(`Last action: ${actionNotice}`);
  }
}

const dashboardCommand: CommandModule<DashboardArgs, DashboardArgs> = {
  command: "dashboard",
  describe: "Show a live dashboard of sessions and scheduler status",
  builder: (yargs: Argv<DashboardArgs>) =>
    yargs
      .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
      })
      .option("watch", {
        type: "boolean",
        description: "Keep the dashboard live (like top)",
        default: false,
      })
      .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
      }),
  handler: async (argv) => {
    const ttlMs = getTtlMs(argv.ttl);

    if (!argv.watch) {
      const [rawSessions, rawJobs] = await Promise.all([
        listSessions(),
        listJobs(),
      ]);
      const intervalMs = getIntervalMs(argv.interval);
      const now = Date.now();
      const sessions = sortSessionsForDisplay(rawSessions, ttlMs, now);
      const jobs = sortJobsForDisplay(rawJobs);
      await renderDashboard(sessions, jobs, ttlMs, intervalMs, now);
      return;
    }

    const intervalMs = getIntervalMs(argv.interval);
    let renderInProgress = false;
    let renderRequested = false;
    let lastActionNotice: string | undefined;
    let inAltScreen = false;

    // Interactive mode state
    let isInteractiveMode = false;
    let awaitingConfirmation = false;
    let inputBuffer = "";
    let pendingAction: DashboardAction | null = null;
    let pendingTargetId: string | null = null;
    let interactivePrompt = "";
    let displayJobs: Job[] = [];
    let displaySessions: SessionRecord[] = [];

    const render = async () => {
      const [rawSessions, rawJobs] = await Promise.all([
        listSessions(),
        listJobs(),
      ]);
      const now = Date.now();
      displaySessions = sortSessionsForDisplay(rawSessions, ttlMs, now);
      displayJobs = sortJobsForDisplay(rawJobs);

      await renderDashboard(
        displaySessions,
        displayJobs,
        ttlMs,
        intervalMs,
        now,
        lastActionNotice,
      );

      // If in interactive mode, re-display the prompt and input
      if (isInteractiveMode && interactivePrompt) {
        process.stdout.write(interactivePrompt + inputBuffer);
      }
    };

    const renderSafe = async () => {
      if (renderInProgress) {
        renderRequested = true;
        return;
      }
      renderInProgress = true;
      try {
        do {
          renderRequested = false;
          await render();
        } while (renderRequested);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastActionNotice = `Dashboard refresh failed: ${message}`;
      } finally {
        renderInProgress = false;
      }
    };

    const executeAction = async (
      action: DashboardAction,
      id: string,
    ): Promise<string> => {
      if (action === "delete") {
        const job = await getJob(id);
        if (!job) {
          return `Job "${id}" not found`;
        }
        await deleteJob(id);
        return `Deleted job "${id}"`;
      }

      if (action === "reset") {
        const job = await getJob(id);
        if (!job) {
          return `Job "${id}" not found`;
        }
        await resetJob(id);
        return `Reset job "${id}"`;
      }

      if (action === "pause") {
        const job = await getJob(id);
        if (!job) {
          return `Job "${id}" not found`;
        }
        const paused = await daemonPauseJob(id);
        return paused ? `Paused job "${id}"` : `Failed to pause job "${id}"`;
      }

      if (action === "resume") {
        const job = await getJob(id);
        if (!job) {
          return `Job "${id}" not found`;
        }
        const resumed = await daemonResumeJob(id);
        return resumed
          ? `Resumed job "${id}"`
          : `Failed to resume job "${id}"`;
      }

      const killed = await killSession(id);
      return killed
        ? `Killed session "${id}"`
        : `Failed to kill session "${id}" or process already terminated`;
    };

    const restoreTerminal = () => {
      if (!inAltScreen) {
        return;
      }
      inAltScreen = false;
      if (process.stdout.isTTY) {
        process.stdout.write(ALT_SCREEN_OFF);
      }
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    if (process.stdout.isTTY) {
      process.stdout.write(ALT_SCREEN_ON);
      inAltScreen = true;
      process.once("exit", restoreTerminal);
      process.once("SIGTERM", () => {
        restoreTerminal();
        process.exit(0);
      });
    }

    await renderSafe();
    const intervalId = setInterval(() => {
      void renderSafe();
    }, intervalMs);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const handleInput = async (data: Buffer) => {
        const key = data.toString("utf-8");
        const lower = key.toLowerCase();

        // Ctrl+C to exit
        if (key === "\u0003") {
          clearInterval(intervalId);
          restoreTerminal();
          process.exit(0);
        }

        if (isInteractiveMode) {
          // ESC cancels current in-progress action
          if (key === "\u001b") {
            isInteractiveMode = false;
            awaitingConfirmation = false;
            pendingAction = null;
            pendingTargetId = null;
            inputBuffer = "";
            interactivePrompt = "";
            lastActionNotice = "Cancelled pending action";
            await renderSafe();
            return;
          }

          if (awaitingConfirmation) {
            const actionToRun = pendingAction;
            const targetId = pendingTargetId;

            isInteractiveMode = false;
            awaitingConfirmation = false;
            pendingAction = null;
            pendingTargetId = null;
            inputBuffer = "";
            interactivePrompt = "";

            if (lower === "y" && actionToRun && targetId) {
              lastActionNotice = await executeAction(actionToRun, targetId);
            } else {
              lastActionNotice = "Action cancelled";
            }
            await renderSafe();
            return;
          }

          if (key === "\r" || key === "\n") {
            // Enter pressed - resolve target id and ask for confirmation
            const requestedId = inputBuffer.trim();
            inputBuffer = "";

            if (!requestedId || !pendingAction) {
              isInteractiveMode = false;
              pendingAction = null;
              interactivePrompt = "";
              lastActionNotice = "No target selected";
              await renderSafe();
              return;
            }

            let actualId = requestedId;

            if (!isNaN(Number(requestedId)) && Number(requestedId) > 0) {
              const numId = parseInt(requestedId, 10);
              if (pendingAction === "killSession") {
                if (numId <= displaySessions.length) {
                  actualId = displaySessions[numId - 1].id;
                }
              } else if (numId <= displayJobs.length) {
                actualId = displayJobs[numId - 1]?.id || requestedId;
              }
            }

            pendingTargetId = actualId;
            awaitingConfirmation = true;
            interactivePrompt = `\nConfirm ${getActionVerb(pendingAction)} "${actualId}"? [y/N]: `;
            process.stdout.write(interactivePrompt);
            return;
          }

          if (key === "\u007F" || key === "\b") {
            inputBuffer = inputBuffer.slice(0, -1);
            process.stdout.write(`\r\x1b[K${interactivePrompt}${inputBuffer}`);
            return;
          }

          if (!key.match(/[\r\n]/)) {
            inputBuffer += key;
            process.stdout.write(key);
          }
          return;
        }

        if (lower === "p") {
          const removed = await pruneStaleSessions(ttlMs);
          lastActionNotice =
            removed.length === 0
              ? "No stale sessions to remove"
              : `Pruned ${removed.length} stale session(s)`;
          await renderSafe();
          return;
        }

        if (lower === "s") {
          const running = await isDaemonRunning();
          if (running) {
            const status = await getDaemonStatus();
            lastActionNotice = `Scheduler already running (pid: ${status.pid})`;
          } else {
            const started = await startDaemon();
            lastActionNotice = started
              ? "Started scheduler daemon"
              : "Failed to start scheduler daemon";
          }
          await renderSafe();
          return;
        }

        if (lower === "t") {
          const running = await isDaemonRunning();
          if (!running) {
            lastActionNotice = "Scheduler daemon is not running";
          } else {
            const stopped = await stopDaemon();
            lastActionNotice = stopped
              ? "Stopped scheduler daemon"
              : "Failed to stop scheduler daemon";
          }
          await renderSafe();
          return;
        }

        if (lower === "d") {
          isInteractiveMode = true;
          awaitingConfirmation = false;
          pendingAction = "delete";
          pendingTargetId = null;
          inputBuffer = "";
          interactivePrompt = getActionPrompt("delete");
          process.stdout.write(interactivePrompt);
          return;
        }

        if (lower === "r") {
          isInteractiveMode = true;
          awaitingConfirmation = false;
          pendingAction = "reset";
          pendingTargetId = null;
          inputBuffer = "";
          interactivePrompt = getActionPrompt("reset");
          process.stdout.write(interactivePrompt);
          return;
        }

        if (lower === "a") {
          isInteractiveMode = true;
          awaitingConfirmation = false;
          pendingAction = "pause";
          pendingTargetId = null;
          inputBuffer = "";
          interactivePrompt = getActionPrompt("pause");
          process.stdout.write(interactivePrompt);
          return;
        }

        if (lower === "e") {
          isInteractiveMode = true;
          awaitingConfirmation = false;
          pendingAction = "resume";
          pendingTargetId = null;
          inputBuffer = "";
          interactivePrompt = getActionPrompt("resume");
          process.stdout.write(interactivePrompt);
          return;
        }

        if (lower === "k") {
          isInteractiveMode = true;
          awaitingConfirmation = false;
          pendingAction = "killSession";
          pendingTargetId = null;
          inputBuffer = "";
          interactivePrompt = getActionPrompt("killSession");
          process.stdout.write(interactivePrompt);
        }
      };

      process.stdin.on("data", handleInput);
    }

    process.stdin.on("end", () => {
      clearInterval(intervalId);
      restoreTerminal();
      process.exit(0);
    });
  },
};

export { dashboardCommand };
