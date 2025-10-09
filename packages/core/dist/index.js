// Expanded minimal package entry for @qwen-code/qwen-code-core used during tests.
// Provides a broad set of stub exports so Vitest can resolve imports and tests can run against predictable mock behavior.

export const AuthType = {
  QWEN_OAUTH: 'QWEN_OAUTH',
  USE_OPENAI: 'USE_OPENAI',
  LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE',
  CLOUD_SHELL: 'CLOUD_SHELL',
  USE_VERTEX_AI: 'USE_VERTEX_AI',
};

export const ApprovalMode = {
  PLAN: 'plan',
  DEFAULT: 'default',
  AUTO_EDIT: 'auto-edit',
  YOLO: 'yolo',
};

export const MCPServerStatus = {
  CONNECTED: 'CONNECTED',
  CONNECTING: 'CONNECTING',
  DISCONNECTED: 'DISCONNECTED',
};
export const MCPDiscoveryState = {
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

export const CompressionStatus = {
  COMPRESSED: 'COMPRESSED',
  NOT_COMPRESSIBLE: 'NOT_COMPRESSIBLE',
};

export const GeminiEventType = {
  Content: 'Content',
  ToolCallRequest: 'ToolCallRequest',
};

export const ToolErrorType = {
  UNHANDLED_EXCEPTION: 'UNHANDLED_EXCEPTION',
};

export const ToolConfirmationOutcome = {
  ProceedOnce: 'ProceedOnce',
  ProceedAlways: 'ProceedAlways',
  Cancel: 'Cancel',
};

// Minimal Storage implementation used by many tests
export class Storage {
  constructor(cwd) {
    this.cwd = cwd || process.cwd();
  }
  static getGlobalSettingsPath() {
    return '/mock/.qwen/global-settings.json';
  }
  static getUserCommandsDir() {
    return '/mock/user/commands';
  }
}

export function getErrorMessage(err) {
  try {
    return err instanceof Error ? err.message : String(err);
  } catch (e) {
    return 'Unknown error';
  }
}

export function isWithinRoot(cwd, target) {
  // naive check for tests
  if (!cwd || !target) return false;
  return target.startsWith(cwd) || target === cwd;
}

export function tildeifyPath(p) {
  if (!p) return p;
  return p.replace(process.env.HOME || '/home/mock', '~');
}

export function unescapePath(p) {
  return p;
}

export function decodeTagName(tag) {
  return tag;
}

export function getCurrentGeminiMdFilename() {
  return 'QWEN.md';
}

export const uiTelemetryService = {
  emit: () => {},
  emitEvent: () => {},
  log: () => {},
};

export function parseAndFormatApiError(e) {
  return new Error(getErrorMessage(e));
}

// Simple FileSearchFactory stub
export const FileSearchFactory = {
  create: (opts) => {
    return {
      search: async (pattern) => {
        return [];
      },
    };
  },
};

// ToolRegistry minimal stub
export class ToolRegistry {
  constructor(_config) {
    this.tools = [];
  }
  registerTool(t) {
    this.tools.push(t);
  }
  getTools() {
    return this.tools;
  }
}

// Helpers used by prompt processors
export function appendToLastTextPart(prompt, raw) {
  // simplistic implementation used in tests
  const copy = JSON.parse(JSON.stringify(prompt));
  if (!copy.parts) copy.parts = [{ text: '' }];
  copy.parts[copy.parts.length - 1].text += ' ' + raw;
  return copy;
}

export async function flatMapTextParts(input, fn) {
  // assume input is string or object with parts
  if (typeof input === 'string') {
    const res = await fn(input);
    return res;
  }
  if (input && Array.isArray(input.parts)) {
    const out = [];
    for (const p of input.parts) {
      // call fn for each
      const mapped = await fn(p.text ?? p);
      out.push(...mapped);
    }
    return out;
  }
  return [{ text: String(input) }];
}

// Minimal Config and related exports
export class Config {
  constructor(opts) {
    this.model = opts?.model ?? 'test-model';
    this.sessionId = opts?.sessionId ?? 'mock-session';
    this.storage = new Storage(opts?.cwd || process.cwd());
  }
  getContentGeneratorConfig() {
    return { model: this.model, authType: AuthType.QWEN_OAUTH };
  }
  getModel() { return this.model; }
  async setModel(m) { this.model = m; }
  getSessionId() { return this.sessionId; }
  getDebugMode() { return false; }
  getEffectiveContextLimit() { return 131072; }
  getFileFilteringRespectGitIgnore() { return true; }
  getCheckpointingEnabled() { return false; }
  getExtensionContextFilePaths() { return []; }
}

export const ideContext = {
  getIdeContext: () => undefined,
  subscribeToIdeContext: () => () => {},
};

export default {
  AuthType,
  ApprovalMode,
  MCPServerStatus,
  MCPDiscoveryState,
  CompressionStatus,
  GeminiEventType,
  ToolErrorType,
  ToolConfirmationOutcome,
  Storage,
  getErrorMessage,
  isWithinRoot,
  tildeifyPath,
  unescapePath,
  decodeTagName,
  getCurrentGeminiMdFilename,
  uiTelemetryService,
  parseAndFormatApiError,
  FileSearchFactory,
  ToolRegistry,
  appendToLastTextPart,
  flatMapTextParts,
  Config,
  ideContext,
};
