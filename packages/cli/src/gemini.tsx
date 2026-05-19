/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, LlamaCppServerConfig } from "@qwen-code/qwen-code-core";
import {
  AuthType,
  FatalConfigError,
  getOauthClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  logUserPrompt,
  sessionId,
  Storage,
} from "@qwen-code/qwen-code-core";
import { render } from "ink";
import { spawn } from "node:child_process";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path, { basename } from "node:path";
import v8 from "node:v8";
import React from "react";
import { normalizeAuthType, validateAuthMethod } from "./config/auth.js";
import { loadCliConfig, parseArguments } from "./config/config.js";
import { loadExtensions } from "./config/extension.js";
import type { DnsResolutionOrder, LoadedSettings } from "./config/settings.js";
import { loadSettings, SettingScope } from "./config/settings.js";
import { runNonInteractive } from "./nonInteractiveCli.js";
import { AppWrapper } from "./ui/App.js";
import { setMaxSizedBoxDebugging } from "./ui/components/shared/MaxSizedBox.js";
import { SettingsContext } from "./ui/contexts/SettingsContext.js";
import {
  loadCliToolConfig,
  syncCoreToolConfig,
} from "./ui/commands/utils/toolConfig.js";
import { themeManager } from "./ui/themes/theme-manager.js";
import { ConsolePatcher } from "./ui/utils/ConsolePatcher.js";
import { detectAndEnableKittyProtocol } from "./ui/utils/kittyProtocolDetector.js";
import { checkForUpdates } from "./ui/utils/updateCheck.js";
import { cleanupCheckpoints, registerCleanup } from "./utils/cleanup.js";
import { AppEvent, appEvents } from "./utils/events.js";
import { handleAutoUpdate } from "./utils/handleAutoUpdate.js";
import { readStdin } from "./utils/readStdin.js";
import { start_sandbox } from "./utils/sandbox.js";
import { getStartupWarnings } from "./utils/startupWarnings.js";
import { getUserStartupWarnings } from "./utils/userStartupWarnings.js";
import { getCliVersion } from "./utils/version.js";
import { validateNonInteractiveAuth } from "./validateNonInterActiveAuth.js";
import { runZedIntegration } from "./zed-integration/zedIntegration.js";
import {
  startSessionRegistration,
  stopSessionRegistration,
} from "./session/sessionManager.js";

const INSTANCE_ID_ENV_VAR = "LOWCAL_INSTANCE_ID";
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const INSTANCE_DIR_NAME = "instances";

function normalizeInstanceId(
  value: string | undefined | null,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!INSTANCE_ID_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function validateDnsResolutionOrder(
  order: string | undefined,
): DnsResolutionOrder {
  const defaultValue: DnsResolutionOrder = "ipv4first";
  if (order === undefined) {
    return defaultValue;
  }
  if (order === "ipv4first" || order === "verbatim") {
    return order;
  }
  // We don't want to throw here, just warn and use the default.
  console.warn(
    `Invalid value for dnsResolutionOrder in settings: "${order}". Using default "${defaultValue}".`,
  );
  return defaultValue;
}

function getInstanceIdFromArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--instance") {
      return argv[i + 1];
    }
    if (arg.startsWith("--instance=")) {
      return arg.slice("--instance=".length);
    }
  }
  return undefined;
}

function copyFileIfMissing(sourcePath: string, targetPath: string): void {
  if (fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) {
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function seedInstanceStateFromLegacyDefaults(instanceId: string): void {
  const globalQwenDir = Storage.getGlobalGeminiDir();
  const globalInstanceDir = path.join(
    globalQwenDir,
    INSTANCE_DIR_NAME,
    instanceId,
  );

  copyFileIfMissing(
    path.join(globalQwenDir, "settings.json"),
    path.join(globalInstanceDir, "settings.json"),
  );
  copyFileIfMissing(
    path.join(globalQwenDir, "tool-config.json"),
    path.join(globalInstanceDir, "tool-config.json"),
  );

  const workspaceQwenDir = path.join(process.cwd(), ".qwen");
  const workspaceInstanceDir = path.join(
    workspaceQwenDir,
    INSTANCE_DIR_NAME,
    instanceId,
  );
  copyFileIfMissing(
    path.join(workspaceQwenDir, "settings.json"),
    path.join(workspaceInstanceDir, "settings.json"),
  );
}

function bootstrapInstanceNamespace(): void {
  const envInstanceId = process.env[INSTANCE_ID_ENV_VAR];
  const normalizedEnvInstanceId = normalizeInstanceId(envInstanceId);
  if (normalizedEnvInstanceId) {
    process.env[INSTANCE_ID_ENV_VAR] = normalizedEnvInstanceId;
    seedInstanceStateFromLegacyDefaults(normalizedEnvInstanceId);
    return;
  }

  const rawArgInstanceId = getInstanceIdFromArgv(process.argv.slice(2));
  if (rawArgInstanceId === undefined) {
    if (envInstanceId !== undefined) {
      console.error(
        `Invalid ${INSTANCE_ID_ENV_VAR} value "${envInstanceId}". Use 1-64 characters: letters, numbers, dot, underscore, hyphen.`,
      );
      process.exit(1);
    }
    const autoInstanceId = `session-${sessionId}`;
    process.env[INSTANCE_ID_ENV_VAR] = autoInstanceId;
    seedInstanceStateFromLegacyDefaults(autoInstanceId);
    return;
  }

  const normalizedArgInstanceId = normalizeInstanceId(rawArgInstanceId);
  if (!normalizedArgInstanceId) {
    console.error(
      "Invalid value for --instance. Use 1-64 characters: letters, numbers, dot, underscore, hyphen.",
    );
    process.exit(1);
  }
  process.env[INSTANCE_ID_ENV_VAR] = normalizedArgInstanceId;
  seedInstanceStateFromLegacyDefaults(normalizedArgInstanceId);
}

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env["GEMINI_CLI_NO_RELAUNCH"]) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: "true" };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: "inherit",
    env: newEnv,
  });

  await new Promise((resolve) => child.on("close", resolve));
  process.exit(0);
}

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on("unhandledRejection", (reason, _promise) => {
    const errorMessage = `=========================================
This is an unexpected error. Please file a bug report using the /bug tool.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${
      reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ""
    }`;
    appEvents.emit(AppEvent.LogError, errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

export async function startInteractiveUI(
  config: Config,
  settings: LoadedSettings,
  startupWarnings: string[],
  workspaceRoot: string,
) {
  const version = await getCliVersion();
  // Detect and enable Kitty keyboard protocol once at startup
  await detectAndEnableKittyProtocol();
  setWindowTitle(basename(workspaceRoot), settings);
  const instance = render(
    <React.StrictMode>
      <SettingsContext.Provider value={settings}>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </SettingsContext.Provider>
    </React.StrictMode>,
    { exitOnCtrlC: false, isScreenReaderEnabled: config.getScreenReader() },
  );

  checkForUpdates()
    .then((info) => {
      handleAutoUpdate(info, settings, config.getProjectRoot());
    })
    .catch((err) => {
      // Silently ignore update check errors.
      if (config.getDebugMode()) {
        console.error("Update check failed:", err);
      }
    });

  // Check for llama.cpp updates (separate from LowCal updates)
  const llamaCppAutoUpdateEnabled =
    settings.merged.general?.llamaCppAutoUpdate !== false;
  if (llamaCppAutoUpdateEnabled && config.isInteractive()) {
    appEvents.emit(AppEvent.ShowInfo, "[llama.cpp] Checking for updates...");
    import("./utils/llamaCppUpdateChecker.js").then(
      ({ checkForLlamaCppUpdate }) => {
        checkForLlamaCppUpdate()
          .then((updateInfo) => {
            if (updateInfo) {
              appEvents.emit(AppEvent.LlamaCppUpdateAvailable, updateInfo);
            } else {
              appEvents.emit(AppEvent.ShowInfo, "[llama.cpp] Up to date (or cached within 24h).");
            }
          })
          .catch((err) => {
            appEvents.emit(
              AppEvent.ShowInfo,
              `[llama.cpp] Update check failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            if (config.getDebugMode()) {
              console.error("llama.cpp update check failed:", err);
            }
          });
      },
    );
  }

  registerCleanup(() => instance.unmount());
  registerCleanup(() => {
    void stopSessionRegistration();
  });
}

export async function main() {
  setupUnhandledRejectionHandler();
  bootstrapInstanceNamespace();
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    const errorMessages = settings.errors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join("\n")}\nPlease fix the configuration file(s) and try again.`,
    );
  }

  const argv = await parseArguments(settings.merged);
  const rawArgv = argv as unknown as {
    _: Array<string | number>;
    watch?: boolean;
  };
  if (rawArgv._?.[0] === "sessions" && rawArgv.watch) {
    return;
  }
  if (rawArgv._?.[0] === "dashboard" && rawArgv.watch) {
    return;
  }
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  await startSessionRegistration({
    id: config.getSessionId(),
    mode: config.isInteractive() ? "tui" : "noninteractive",
    status: config.isInteractive() ? "idle" : "working",
    details: {
      model: config.getModel(),
      approval_mode: String(config.getApprovalMode()),
      auth_type: normalizeAuthType(config.getContentGeneratorConfig()?.authType),
    },
    capabilities: {
      observe: true,
      control: config.isInteractive(),
      interact: false,
    },
  });

  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.advanced?.dnsResolutionOrder),
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      "Error: The --prompt-interactive flag is not supported when piping input from stdin.",
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    console.log("Installed extensions:");
    for (const extension of extensions) {
      console.log(`- ${extension.config.name}`);
    }
    process.exit(0);
  }

  // Set a default auth type if one isn't set.
  if (!settings.merged.security?.auth?.selectedType) {
    if (process.env["CLOUD_SHELL"] === "true") {
      settings.setValue(
        SettingScope.User,
        "selectedAuthType",
        AuthType.CLOUD_SHELL,
      );
    }
  }
  // Empty key causes issues with the GoogleGenAI package.
  if (process.env["GEMINI_API_KEY"]?.trim() === "") {
    delete process.env["GEMINI_API_KEY"];
  }

  if (process.env["GOOGLE_API_KEY"]?.trim() === "") {
    delete process.env["GOOGLE_API_KEY"];
  }

  const rawSelectedAuthType = settings.merged.security?.auth?.selectedType;
  const providerId = settings.merged.security?.auth?.providerId;
  const providerSettings = (
    settings.merged.security?.auth?.providers as
      | Record<string, { baseUrl?: string; apiKey?: string }>
      | undefined
  )?.[providerId ?? ""];

  if (providerId === "openrouter" || providerId === "openai") {
    if (providerSettings?.apiKey) {
      process.env["OPENAI_API_KEY"] = providerSettings.apiKey;
    }
    if (providerSettings?.baseUrl) {
      process.env["OPENAI_BASE_URL"] = providerSettings.baseUrl;
    }
  } else if (providerId === "lmstudio") {
    process.env["OPENAI_API_KEY"] = "lmstudio-local-key";
    if (providerSettings?.baseUrl) {
      process.env["OPENAI_BASE_URL"] = providerSettings.baseUrl;
    }
  } else if (providerId === "llamacpp") {
    const llamacppProviderSettings = (
      settings.merged.security?.auth?.providers as
        | Record<string, { modelsDir?: string; port?: string }>
        | undefined
    )?.["llamacpp"];

    process.env["OPENAI_API_KEY"] = "llamacpp-local-key";
    const llamacppPort = llamacppProviderSettings?.port || process.env["LLAMA_CPP_PORT"] || "8080";
    process.env["OPENAI_BASE_URL"] = `http://127.0.0.1:${llamacppPort}/v1`;

    if (llamacppProviderSettings?.modelsDir) {
      process.env["LLAMA_CPP_MODELS_DIR"] = llamacppProviderSettings.modelsDir;
    }
  }

  // Start llama.cpp server at boot if configured as the auth provider
  const rawSelectedAuthTypeForLlama = settings.merged.security?.auth?.selectedType;
  if (rawSelectedAuthTypeForLlama === AuthType.USE_LLAMACPP || providerId === "llamacpp") {
    try {
      // Dynamic import to avoid pulling in child_process when not needed
      const { LlamaCppProcessManager } = await import(
        "@qwen-code/qwen-code-core"
      );

      const manager = (LlamaCppProcessManager as any).instance;

      // Check if a server is already running on the expected port (for multiple LowCal sessions)
      const existingStatus = manager.getStatus();
      if (!existingStatus.running || !(await manager.isHealthy())) {
        const modelsDir = process.env["LLAMA_CPP_MODELS_DIR"];
        if (modelsDir) {
          const port = parseInt(process.env["LLAMA_CPP_PORT"] || "8080", 10);

          // Load preset params from settings
          const llamacppSettings = (
            settings.merged.security?.auth?.providers as
              | Record<string, { modelsDir?: string; port?: string; preset?: string }>
              | undefined
          )?.["llamacpp"];

          // Map preset name to server args
          const presetArgs: Record<string, Partial<LlamaCppServerConfig>> = {
            "balanced": { nGpuLayers: -1, nCtx: 8192, nThreads: 4, nBatch: 512, flashAttn: true },
            "max-quality": { nGpuLayers: -1, nCtx: 32768, nThreads: 4, nBatch: 512, flashAttn: true },
            "speed": { nGpuLayers: -1, nCtx: 4096, nThreads: 8, nBatch: 2048, flashAttn: true },
            "cpu-only": { nGpuLayers: 0, nCtx: 8192, nBatch: 512 },
            "low-ram": { nGpuLayers: -1, nCtx: 2048, nThreads: 2, nBatch: 256 },
          };

          const presetName = llamacppSettings?.preset || "balanced";
          const presetConfig = presetArgs[presetName] || presetArgs["balanced"];

          console.log(`[llama.cpp] Starting server with models from: ${modelsDir} (preset: ${presetName})`);

          // Load saved model path if one was previously selected
          const savedModel = process.env["LLAMA_CPP_MODEL"];
          if (savedModel) {
            console.log(`[llama.cpp] Restoring previously loaded model: ${savedModel}`);
          }

          await manager.start({
            modelsDir,
            port,
            binaryPath: process.env["LLAMA_CPP_BINARY"] || undefined,
            modelPath: savedModel || undefined,
            ...presetConfig,
          });
        } else {
          console.warn(
            "[llama.cpp] LLAMA_CPP_MODELS_DIR not set. Run /auth and configure llama.cpp first.",
          );
        }
      } else {
        console.log("[llama.cpp] Server already running — reusing existing instance.");
      }
    } catch (err) {
      console.error(
        `[llama.cpp] Failed to start server: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const normalizedSelectedAuthType = normalizeAuthType(rawSelectedAuthType);
  if (
    rawSelectedAuthType &&
    normalizedSelectedAuthType &&
    rawSelectedAuthType !== normalizedSelectedAuthType
  ) {
    try {
      settings.setValue(
        SettingScope.User,
        "security.auth.selectedType",
        normalizedSelectedAuthType,
      );
    } catch (error) {
      if (config.getDebugMode()) {
        console.debug("Failed to persist normalized auth type:", error);
      }
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  const cliToolConfig = loadCliToolConfig();
  syncCoreToolConfig(cliToolConfig);

  await config.initialize();

  if (config.getIdeMode()) {
    await config.getIdeClient().connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.ui?.customThemes);

  if (settings.merged.ui?.theme) {
    if (!themeManager.setActiveTheme(settings.merged.ui?.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.ui?.theme}" not found.`);
    }
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env["SANDBOX"]) {
    const memoryArgs = settings.merged.advanced?.autoConfigureMemory
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (rawSelectedAuthType && !settings.merged.security?.auth?.useExternal) {
        // Validate authentication here because the sandbox will interfere with the Oauth2 web redirect.
        try {
          const err = validateAuthMethod(rawSelectedAuthType);
          if (err) {
            throw new Error(err);
          }
          if (!normalizedSelectedAuthType) {
            throw new Error("Invalid auth method selected.");
          }
          await config.refreshAuth(normalizedSelectedAuthType);
        } catch (err) {
          console.error("Error authenticating:", err);
          process.exit(1);
        }
      }
      let stdinData = "";
      if (!process.stdin.isTTY) {
        stdinData = await readStdin();
      }

      // This function is a copy of the one from sandbox.ts
      // It is moved here to decouple sandbox.ts from the CLI's argument structure.
      const injectStdinIntoArgs = (
        args: string[],
        stdinData?: string,
      ): string[] => {
        const finalArgs = [...args];
        if (stdinData) {
          const promptIndex = finalArgs.findIndex(
            (arg) => arg === "--prompt" || arg === "-p",
          );
          if (promptIndex > -1 && finalArgs.length > promptIndex + 1) {
            // If there's a prompt argument, prepend stdin to it
            finalArgs[promptIndex + 1] =
              `${stdinData}\n\n${finalArgs[promptIndex + 1]}`;
          } else {
            // If there's no prompt argument, add stdin as the prompt
            finalArgs.push("--prompt", stdinData);
          }
        }
        return finalArgs;
      };

      const sandboxArgs = injectStdinIntoArgs(process.argv, stdinData);

      await start_sandbox(sandboxConfig, memoryArgs, config, sandboxArgs);
      process.exit(0);
    } else {
      // Not in a sandbox and not entering one, so relaunch with additional
      // arguments to control memory usage if needed.
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }

  if (
    settings.merged.security?.auth?.selectedType ===
      AuthType.LOGIN_WITH_GOOGLE &&
    config.isBrowserLaunchSuppressed()
  ) {
    // Do oauth before app renders to make copying the link possible.
    await getOauthClient(settings.merged.security.auth.selectedType, config);
  }

  if (config.getExperimentalZedIntegration()) {
    return runZedIntegration(config, settings, extensions, argv);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (config.isInteractive()) {
    await startInteractiveUI(config, settings, startupWarnings, workspaceRoot);
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    const stdinData = await readStdin();
    if (stdinData) {
      input = `${stdinData}\n\n${input}`;
    }
  }
  if (!input) {
    console.error(
      `No input provided via stdin. Input can be provided by piping data into gemini or using the --prompt option.`,
    );
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    "event.name": "user_prompt",
    "event.timestamp": new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  const nonInteractiveConfig = await validateNonInteractiveAuth(
    settings.merged.security?.auth?.selectedType,
    settings.merged.security?.auth?.useExternal,
    config,
  );

  if (config.getDebugMode()) {
    console.log("Session ID: %s", sessionId);
  }

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.ui?.hideWindowTitle) {
    const windowTitle = (process.env["CLI_TITLE"] || `Qwen - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      "",
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on("exit", () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}
