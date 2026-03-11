/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  chromium,
  firefox,
  type Browser,
  type BrowserContext,
  type Page,
  type BrowserType,
} from '@playwright/test';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { isSubpath, makeRelative, shortenPath } from '../utils/paths.js';

// Default configuration values
const DEFAULT_NAVIGATION_TIMEOUT = 30000;
const DEFAULT_ACTION_TIMEOUT = 15000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Browser control configuration interface
 */
export interface BrowserControlConfig {
  headless?: boolean;
  slowMo?: number;
  devtools?: boolean;
  browser?: 'chromium' | 'firefox';  // Browser type - Firefox uses Juggler protocol, harder to detect
  navigationTimeout?: number;
  actionTimeout?: number;
  maxPagesPerSession?: number;
  maxScreenshotSize?: number;
  allowedOrigins?: string[];
  blockExternal?: boolean;
  sandbox?: boolean;
  // Stealth/bot-detection avoidance options
  userAgent?: string;
  stealth?: boolean;
  // Additional stealth options
  headed?: boolean;  // Run browser in headed mode (non-headless) - much harder to detect
  disableWebGL?: boolean;  // Disable WebGL to avoid canvas fingerprinting
  acceptCookies?: boolean;  // Auto-accept cookies on first visit
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  viewport?: {
    width: number;
    height: number;
  };
  locale?: string;
  timezoneId?: string;
  deviceScaleFactor?: number;
  hasTouch?: boolean;
  permissions?: string[];
}

/**
 * Parameters for the BrowserControl tool
 */
export interface BrowserControlParams {
  /**
   * The browser operation to perform
   */
  operation: string;
  /**
   * Operation-specific parameters
   */
  params?: Record<string, unknown>;
}

/**
 * Result from browser control operations
 */
export interface BrowserControlResult extends ToolResult {
  /**
   * Current page URL
   */
  pageUrl?: string;
  /**
   * Current page title
   */
  pageTitle?: string;
  /**
   * Current page id
   */
  pageId?: string;
  /**
   * List of pages in the session
   */
  pages?: Array<{ id: string; url: string; title: string }>;
  /**
   * Path to saved screenshot (if any)
   */
  screenshotPath?: string;
  /**
   * Base64-encoded screenshot data
   */
  screenshot?: string;
  /**
   * Result value from JavaScript evaluation
   */
  value?: unknown;
  /**
   * Cookies from getCookies operation
   */
  cookies?: unknown[];
  /**
   * Locator result for element selection operations
   */
  locator?: string;
  /**
   * Tracing status
   */
  tracingStatus?: string;
}

/**
 * Browser session manager - handles browser lifecycle
 */
class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private pages: Map<string, Page> = new Map();
  private activePageId: string | null = null;
  private pageCounter = 0;
  private config: BrowserControlConfig;
  private browserType: BrowserType;

  constructor(config: BrowserControlConfig) {
    this.config = config;
    // Use Firefox if specified, otherwise Chromium
    // Firefox uses Juggler protocol which is harder to detect
    this.browserType = config.browser === 'firefox' ? firefox : chromium;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.browser) {
      // Use headed mode if stealth or headed is enabled
      const useHeaded = this.config.headless === false || this.config.headed === true || this.config.stealth === true;
      const launchOptions: Parameters<BrowserType['launch']>[0] = {
        headless: !useHeaded,
        slowMo: this.config.slowMo ?? 0,
        args: [],
      };

      // Add sandbox args if needed
      if (this.config.sandbox === false) {
        launchOptions.args!.push('--no-sandbox', '--disable-setuid-sandbox', '--no-zygote');
      }

      // Add stealth automation-disabling flags
      if (this.config.stealth) {
        launchOptions.args!.push(
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          // Additional anti-fingerprinting
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--enable-features=NetworkService,NetworkServiceInProcess',
        );
        
        // Disable WebGL if requested
        if (this.config.disableWebGL) {
          launchOptions.args!.push(
            '--disable-webgl',
            '--disable-gpu',
            '--use-gl=swiftshader',
          );
        }
      }

      // Add proxy configuration
      if (this.config.proxy) {
        launchOptions.proxy = {
          server: this.config.proxy.server,
        };
        if (this.config.proxy.username && this.config.proxy.password) {
          launchOptions.proxy.username = this.config.proxy.username;
          launchOptions.proxy.password = this.config.proxy.password;
        }
      }

      this.browser = await this.browserType.launch(launchOptions);
    }

    if (!this.context) {
      // Build context options with stealth defaults
      const contextOptions: NonNullable<Parameters<Browser['newContext']>[0]> =
        {};

      // User agent
      if (this.config.userAgent) {
        contextOptions.userAgent = this.config.userAgent;
      }

      // Viewport
      if (this.config.viewport) {
        contextOptions.viewport = this.config.viewport;
      } else if (this.config.stealth) {
        // Default to a common resolution when stealth is enabled
        contextOptions.viewport = { width: 1920, height: 1080 };
      }

      // Locale
      if (this.config.locale) {
        contextOptions.locale = this.config.locale;
      } else if (this.config.stealth) {
        contextOptions.locale = 'en-US';
      }

      // Timezone
      if (this.config.timezoneId) {
        contextOptions.timezoneId = this.config.timezoneId;
      } else if (this.config.stealth) {
        contextOptions.timezoneId = 'America/New_York';
      }

      // Device scale factor
      if (this.config.deviceScaleFactor !== undefined) {
        contextOptions.deviceScaleFactor = this.config.deviceScaleFactor;
      } else if (this.config.stealth) {
        contextOptions.deviceScaleFactor = 1;
      }

      // Has touch
      if (this.config.hasTouch !== undefined) {
        contextOptions.hasTouch = this.config.hasTouch;
      } else if (this.config.stealth) {
        contextOptions.hasTouch = false;
      }

      // Permissions
      if (this.config.permissions) {
        contextOptions.permissions = this.config.permissions;
      } else if (this.config.stealth) {
        contextOptions.permissions = ['geolocation'];
      }

      this.context = await this.browser.newContext(contextOptions);

      // Apply stealth init script to hide automation properties
      if (this.config.stealth) {
        await this.context.addInitScript({
          content: `
            // Hide navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            
            // Fake plugins
            Object.defineProperty(navigator, 'plugins', {
              get: () => [1, 2, 3, 4, 5]
            });
            
            // Fake languages
            Object.defineProperty(navigator, 'languages', {
              get: () => ['en-US', 'en']
            });
            
            // Override chrome runtime
            if (window.chrome) {
              window.chrome.runtime = { id: '', uploadEnabled: true };
            }
            
            // Add fake permissions query
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
              parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission } as PermissionStatus) :
                originalQuery(parameters)
            );
          `
        });
      }
    }

    if (!this.page) {
      const page = await this.context.newPage();
      this.registerPage(page);
    }
  }

  getPage(): Page | null {
    if (this.activePageId && this.pages.has(this.activePageId)) {
      return this.pages.get(this.activePageId) || null;
    }
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  registerPage(page: Page): string {
    const pageId = `page-${this.pageCounter++}`;
    this.pages.set(pageId, page);
    this.page = page;
    this.activePageId = pageId;
    return pageId;
  }

  setActivePage(pageId: string): boolean {
    if (!this.pages.has(pageId)) {
      return false;
    }
    this.activePageId = pageId;
    this.page = this.pages.get(pageId) || null;
    return true;
  }

  getActivePageId(): string | null {
    return this.activePageId;
  }

  async listPages(): Promise<Array<{ id: string; url: string; title: string }>> {
    const results: Array<{ id: string; url: string; title: string }> = [];
    for (const [id, page] of this.pages.entries()) {
      results.push({
        id,
        url: page.url(),
        title: await page.title(),
      });
    }
    return results;
  }

  async closePage(pageId?: string): Promise<boolean> {
    const targetId = pageId ?? this.activePageId;
    if (!targetId) {
      return false;
    }
    const targetPage = this.pages.get(targetId);
    if (!targetPage) {
      return false;
    }
    await targetPage.close().catch(() => {});
    this.pages.delete(targetId);
    if (this.activePageId === targetId) {
      const next = this.pages.keys().next().value as string | undefined;
      if (next) {
        this.activePageId = next;
        this.page = this.pages.get(next) || null;
      } else {
        this.activePageId = null;
        this.page = null;
      }
    }
    return true;
  }

  async close(): Promise<void> {
    for (const [id] of this.pages) {
      await this.closePage(id);
    }

    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  async reset(): Promise<void> {
    await this.close();
    await this.ensureInitialized();
  }
}

// Global browser session (shared across invocations)
let globalSession: BrowserSession | null = null;

/**
 * Helper function to safely get a typed value from params
 */
function getParam<T>(params: Record<string, unknown>, key: string, defaultValue?: T): T | undefined {
  return (params[key] as T) ?? defaultValue;
}

/**
 * Implementation of the BrowserControl tool invocation logic
 */
class BrowserControlToolInvocation extends BaseToolInvocation<
  BrowserControlParams,
  BrowserControlResult
> {
  private readonly config: Config;
  private readonly browserConfig: BrowserControlConfig;

  constructor(config: Config, params: BrowserControlParams) {
    super(params);
    this.config = config;
    this.browserConfig = this.getBrowserConfig();
  }

  getDescription(): string {
    return `Browser operation: ${this.params.operation}`;
  }

  private getBrowserConfig(): BrowserControlConfig {
    // Try to get from Config, otherwise use defaults
    const browserControlConfig = (this.config as unknown as { browserControl?: BrowserControlConfig }).browserControl;
    
    // Realistic default user-agent for Chrome on Linux
    const defaultUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    // Firefox user-agent for Linux
    const firefoxUserAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0';
    
    // Use Firefox by default for stealth - it's harder to detect than Chromium
    const useFirefox = browserControlConfig?.browser === 'firefox' || 
                       (browserControlConfig?.stealth !== false && browserControlConfig?.browser !== 'chromium');
    
    return {
      headless: browserControlConfig?.headless ?? true,  // Headless mode by default (requires X server for headed)
      slowMo: browserControlConfig?.slowMo ?? 0,
      devtools: browserControlConfig?.devtools ?? false,
      browser: useFirefox ? 'firefox' : 'chromium',
      navigationTimeout: browserControlConfig?.navigationTimeout ?? DEFAULT_NAVIGATION_TIMEOUT,
      actionTimeout: browserControlConfig?.actionTimeout ?? DEFAULT_ACTION_TIMEOUT,
      maxPagesPerSession: browserControlConfig?.maxPagesPerSession ?? DEFAULT_MAX_PAGES,
      maxScreenshotSize: browserControlConfig?.maxScreenshotSize ?? DEFAULT_MAX_SCREENSHOT_SIZE,
      allowedOrigins: browserControlConfig?.allowedOrigins,
      blockExternal: browserControlConfig?.blockExternal ?? false,
      sandbox: browserControlConfig?.sandbox ?? true,
      // Stealth options - disabled by default (headless is still detectable but works without X server)
      stealth: browserControlConfig?.stealth ?? false,
      headed: browserControlConfig?.headed ?? false,  // Headless mode by default
      disableWebGL: browserControlConfig?.disableWebGL ?? false,
      acceptCookies: browserControlConfig?.acceptCookies ?? true,
      userAgent: browserControlConfig?.userAgent ?? (useFirefox ? firefoxUserAgent : defaultUserAgent),
      proxy: browserControlConfig?.proxy,
      viewport: browserControlConfig?.viewport,
      locale: browserControlConfig?.locale,
      timezoneId: browserControlConfig?.timezoneId,
      deviceScaleFactor: browserControlConfig?.deviceScaleFactor,
      hasTouch: browserControlConfig?.hasTouch,
      permissions: browserControlConfig?.permissions,
    };
  }

  private getSession(): BrowserSession {
    if (!globalSession) {
      globalSession = new BrowserSession(this.browserConfig);
    }
    return globalSession;
  }

  private async ensureMaxPages(session: BrowserSession): Promise<void> {
    const maxPages = this.browserConfig.maxPagesPerSession ?? DEFAULT_MAX_PAGES;
    const pageCount = (await session.listPages()).length;
    if (pageCount >= maxPages) {
      throw new Error(
        `Maximum pages per session (${maxPages}) reached. Close a page before opening a new one.`,
      );
    }
  }

  private isUrlAllowed(url: string): boolean {
    const allowedOrigins = this.browserConfig.allowedOrigins;

    if (!allowedOrigins || allowedOrigins.length === 0) {
      return true; // No restrictions
    }

    try {
      const parsed = new URL(url);
      const origin = `${parsed.protocol}//${parsed.host}`;
      return allowedOrigins.some(
        (allowed) =>
          origin === allowed || origin.endsWith(`.${allowed}`)
      );
    } catch {
      return false;
    }
  }

  private formatError(operation: string, error: unknown): BrowserControlResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      llmContent: `Error (${operation}): ${errorMessage}`,
      returnDisplay: `Error (${operation}): ${errorMessage}`,
      error: {
        message: errorMessage,
        type: ToolErrorType.EXECUTION_FAILED,
      },
    };
  }

  private buildMetrics(operation: string, durationMs: number): string {
    return `Operation ${operation} completed in ${durationMs}ms`;
  }

  async execute(signal: AbortSignal): Promise<BrowserControlResult> {
    const operation = this.params.operation;
    const opParams = this.params.params || {};
    const startedAt = Date.now();

    try {
      // Initialize browser session for most operations
      if (operation !== 'close') {
        const session = this.getSession();
        await session.ensureInitialized();
      }

      let result: BrowserControlResult;
      switch (operation) {
        case 'goto':
          result = await this.executeGoto(opParams);
          break;
        case 'reload':
          result = await this.executeReload(opParams);
          break;
        case 'goBack':
          result = await this.executeGoBack(opParams);
          break;
        case 'goForward':
          result = await this.executeGoForward(opParams);
          break;
        case 'locator':
          result = await this.executeLocator(opParams);
          break;
        case 'getByRole':
          result = await this.executeGetByRole(opParams);
          break;
        case 'getByText':
          result = await this.executeGetByText(opParams);
          break;
        case 'getByLabel':
          result = await this.executeGetByLabel(opParams);
          break;
        case 'getByPlaceholder':
          result = await this.executeGetByPlaceholder(opParams);
          break;
        case 'getByAltText':
          result = await this.executeGetByAltText(opParams);
          break;
        case 'getByTitle':
          result = await this.executeGetByTitle(opParams);
          break;
        case 'getByTestId':
          result = await this.executeGetByTestId(opParams);
          break;
        case 'fill':
          result = await this.executeFill(opParams);
          break;
        case 'type':
          result = await this.executeType(opParams);
          break;
        case 'clear':
          result = await this.executeClear(opParams);
          break;
        case 'check':
          result = await this.executeCheck(opParams);
          break;
        case 'uncheck':
          result = await this.executeUncheck(opParams);
          break;
        case 'selectOption':
          result = await this.executeSelectOption(opParams);
          break;
        case 'click':
          result = await this.executeClick(opParams);
          break;
        case 'dblclick':
          result = await this.executeDblClick(opParams);
          break;
        case 'evaluate':
          result = await this.executeEvaluate(opParams);
          break;
        case 'textContent':
          result = await this.executeTextContent(opParams);
          break;
        case 'evaluateHandle':
          result = await this.executeEvaluateHandle(opParams);
          break;
        case 'screenshot':
          result = await this.executeScreenshot(opParams);
          break;
        case 'close':
          result = await this.executeClose();
          break;
        case 'newPage':
          result = await this.executeNewPage(opParams);
          break;
        case 'listPages':
          result = await this.executeListPages();
          break;
        case 'switchPage':
          result = await this.executeSwitchPage(opParams);
          break;
        case 'closePage':
          result = await this.executeClosePage(opParams);
          break;
        case 'getCookies':
          result = await this.executeGetCookies(opParams);
          break;
        case 'setCookie':
          result = await this.executeSetCookie(opParams);
          break;
        case 'acceptDialog':
          result = await this.executeAcceptDialog();
          break;
        case 'dismissDialog':
          result = await this.executeDismissDialog();
          break;
        case 'tracingStart':
          result = await this.executeTracingStart(opParams);
          break;
        case 'tracingStop':
          result = await this.executeTracingStop(opParams);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const durationMs = Date.now() - startedAt;
      result.llmContent = `${result.llmContent}\n${this.buildMetrics(operation, durationMs)}`;
      result.returnDisplay = `${result.returnDisplay}\n${this.buildMetrics(operation, durationMs)}`;
      return result;
    } catch (error) {
      return this.formatError(operation, error);
    }
  }

  private async executeGoto(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const url = getParam<string>(params, 'url');
    if (!url) {
      throw new Error('URL is required for goto operation');
    }

    if (!this.isUrlAllowed(url)) {
      throw new Error(`URL not allowed: ${url}. Check allowedOrigins configuration.`);
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const waitUntil = getParam<'load' | 'domcontentloaded' | 'networkidle'>(params, 'waitUntil', 'load');
    const timeout = getParam<number>(params, 'timeout', this.browserConfig.navigationTimeout);

    await page.goto(url, { waitUntil, timeout });

    return await this.createPageResult(`Navigated to ${url}`);
  }

  private async executeReload(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const waitUntil = getParam<'load' | 'domcontentloaded'>(params, 'waitUntil', 'load');
    const timeout = getParam<number>(params, 'timeout', this.browserConfig.navigationTimeout);

    await page.reload({ waitUntil, timeout });

    return await this.createPageResult('Page reloaded');
  }

  private async executeGoBack(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const timeout = getParam<number>(params, 'timeout', this.browserConfig.navigationTimeout);

    await page.goBack({ timeout });

    return await this.createPageResult('Navigated back');
  }

  private async executeGoForward(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const timeout = getParam<number>(params, 'timeout', this.browserConfig.navigationTimeout);

    await page.goForward({ timeout });

    return await this.createPageResult('Navigated forward');
  }

  private async executeLocator(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for locator operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const hasText = getParam<string>(params, 'hasText');
    let locator = page.locator(selector);
    if (hasText) {
      locator = locator.filter({ hasText });
    }

    const count = await locator.count();
    return {
      llmContent: `Locator found ${count} element(s) for selector: ${selector}`,
      returnDisplay: `Locator found ${count} element(s) for selector: ${selector}`,
      locator: selector,
    };
  }

  private async executeGetByRole(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const role = getParam<string>(params, 'role');
    if (!role) {
      throw new Error('Role is required for getByRole operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const name = getParam<string>(params, 'name');
    const locator = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for role: ${role}`,
      returnDisplay: `Locator found ${count} element(s) for role: ${role}`,
      locator: role,
    };
  }

  private async executeGetByText(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const text = getParam<string>(params, 'text');
    if (!text) {
      throw new Error('Text is required for getByText operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const exact = getParam<boolean>(params, 'exact');
    const locator = page.getByText(text, { exact });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for text: ${text}`,
      returnDisplay: `Locator found ${count} element(s) for text: ${text}`,
      locator: text,
    };
  }

  private async executeGetByLabel(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const text = getParam<string>(params, 'text');
    if (!text) {
      throw new Error('Text is required for getByLabel operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const exact = getParam<boolean>(params, 'exact');
    const locator = page.getByLabel(text, { exact });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for label: ${text}`,
      returnDisplay: `Locator found ${count} element(s) for label: ${text}`,
      locator: text,
    };
  }

  private async executeGetByPlaceholder(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const text = getParam<string>(params, 'text');
    if (!text) {
      throw new Error('Text is required for getByPlaceholder operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const exact = getParam<boolean>(params, 'exact');
    const locator = page.getByPlaceholder(text, { exact });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for placeholder: ${text}`,
      returnDisplay: `Locator found ${count} element(s) for placeholder: ${text}`,
      locator: text,
    };
  }

  private async executeGetByAltText(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const text = getParam<string>(params, 'text');
    if (!text) {
      throw new Error('Text is required for getByAltText operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const exact = getParam<boolean>(params, 'exact');
    const locator = page.getByAltText(text, { exact });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for alt text: ${text}`,
      returnDisplay: `Locator found ${count} element(s) for alt text: ${text}`,
      locator: text,
    };
  }

  private async executeGetByTitle(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const text = getParam<string>(params, 'text');
    if (!text) {
      throw new Error('Text is required for getByTitle operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const exact = getParam<boolean>(params, 'exact');
    const locator = page.getByTitle(text, { exact });
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for title: ${text}`,
      returnDisplay: `Locator found ${count} element(s) for title: ${text}`,
      locator: text,
    };
  }

  private async executeGetByTestId(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const testId = getParam<string>(params, 'testId');
    if (!testId) {
      throw new Error('TestId is required for getByTestId operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const locator = page.getByTestId(testId);
    const count = await locator.count();

    return {
      llmContent: `Locator found ${count} element(s) for testId: ${testId}`,
      returnDisplay: `Locator found ${count} element(s) for testId: ${testId}`,
      locator: testId,
    };
  }

  private async executeFill(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    const value = getParam<string>(params, 'value');
    if (!selector) {
      throw new Error('Selector is required for fill operation');
    }
    if (!value) {
      throw new Error('Value is required for fill operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const force = getParam<boolean>(params, 'force');
    const timeout = this.browserConfig.actionTimeout;

    await page.locator(selector).fill(value, { force, timeout });

    return await this.createPageResult(`Filled ${selector} with: ${value}`);
  }

  private async executeType(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    const text = getParam<string>(params, 'text');
    if (!selector) {
      throw new Error('Selector is required for type operation');
    }
    if (!text) {
      throw new Error('Text is required for type operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const delay = getParam<number>(params, 'delay');
    const timeout = this.browserConfig.actionTimeout;

    await page.locator(selector).type(text, { delay, timeout });

    return await this.createPageResult(`Typed into ${selector}: ${text}`);
  }

  private async executeClear(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for clear operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const force = getParam<boolean>(params, 'force');
    const timeout = this.browserConfig.actionTimeout;

    await page.locator(selector).clear({ force, timeout });

    return await this.createPageResult(`Cleared ${selector}`);
  }

  private async executeCheck(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for check operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const force = getParam<boolean>(params, 'force');
    const timeout = this.browserConfig.actionTimeout;

    await page.locator(selector).check({ force, timeout });

    return await this.createPageResult(`Checked ${selector}`);
  }

  private async executeUncheck(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for uncheck operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const force = getParam<boolean>(params, 'force');
    const timeout = this.browserConfig.actionTimeout;

    await page.locator(selector).uncheck({ force, timeout });

    return await this.createPageResult(`Unchecked ${selector}`);
  }

  private async executeSelectOption(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for selectOption operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const values = getParam<string[]>(params, 'values');
    const index = getParam<number>(params, 'index');
    const value = getParam<string>(params, 'value');
    const label = getParam<string>(params, 'label');
    const timeout = this.browserConfig.actionTimeout;

    const selectOptions: {
      values?: string[];
      index?: number;
      value?: string;
      label?: string;
    } = {};
    if (values) selectOptions.values = values;
    if (index !== undefined) selectOptions.index = index;
    if (value) selectOptions.value = value;
    if (label) selectOptions.label = label;

    await page.locator(selector).selectOption(selectOptions, { timeout });

    return await this.createPageResult(`Selected option in ${selector}`);
  }

  private async executeClick(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for click operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const clickOptions: {
      timeout?: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      delay?: number;
      force?: boolean;
      modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'>;
      position?: { x: number; y: number };
    } = {
      timeout: this.browserConfig.actionTimeout,
    };

    const button = getParam<'left' | 'right' | 'middle'>(params, 'button');
    const clickCount = getParam<number>(params, 'clickCount');
    const delay = getParam<number>(params, 'delay');
    const force = getParam<boolean>(params, 'force');
    const modifiers = getParam<Array<'Alt' | 'Control' | 'Meta' | 'Shift'>>(params, 'modifiers');
    const position = getParam<{ x: number; y: number }>(params, 'position');

    if (button) clickOptions.button = button;
    if (clickCount) clickOptions.clickCount = clickCount;
    if (delay) clickOptions.delay = delay;
    if (force) clickOptions.force = force;
    if (modifiers) clickOptions.modifiers = modifiers;
    if (position) clickOptions.position = position;

    await page.locator(selector).click(clickOptions);

    return await this.createPageResult(`Clicked ${selector}`);
  }

  private async executeDblClick(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const selector = getParam<string>(params, 'selector');
    if (!selector) {
      throw new Error('Selector is required for dblclick operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const clickOptions: {
      timeout?: number;
      button?: 'left' | 'right' | 'middle';
      delay?: number;
      force?: boolean;
      position?: { x: number; y: number };
    } = {
      timeout: this.browserConfig.actionTimeout,
    };

    const button = getParam<'left' | 'right' | 'middle'>(params, 'button');
    const delay = getParam<number>(params, 'delay');
    const force = getParam<boolean>(params, 'force');
    const position = getParam<{ x: number; y: number }>(params, 'position');

    if (button) clickOptions.button = button;
    if (delay) clickOptions.delay = delay;
    if (force) clickOptions.force = force;
    if (position) clickOptions.position = position;

    await page.locator(selector).dblclick(clickOptions);

    return await this.createPageResult(`Double-clicked ${selector}`);
  }

  private async executeEvaluate(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const script = getParam<string>(params, 'script');
    if (!script) {
      throw new Error('Script is required for evaluate operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const args = getParam<unknown[]>(params, 'args');
    const result = await page.evaluate(script, args);

    return {
      llmContent: `Evaluated JavaScript: ${script}`,
      returnDisplay: `JavaScript evaluation result: ${JSON.stringify(result)}`,
      value: result,
    };
  }

  private async executeEvaluateHandle(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const script = getParam<string>(params, 'script');
    if (!script) {
      throw new Error('Script is required for evaluateHandle operation');
    }

    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const args = getParam<unknown[]>(params, 'args');
    const result = await page.evaluateHandle(script, args);

    return {
      llmContent: `Evaluated JavaScript handle: ${script}`,
      returnDisplay: `JavaScript handle created`,
      value: result.toString(),
    };
  }

  private async executeTextContent(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    // Get selector (optional - defaults to body)
    const selector = getParam<string>(params, 'selector') || 'body';
    
    // Get maxLength (optional - defaults to 10000)
    const maxLength = getParam<number>(params, 'maxLength') || 10000;

    // Use Playwright's locator which handles shadow DOM automatically
    const locator = page.locator(selector);
    
    // Get text content (handles shadow DOM automatically)
    let text = await locator.textContent();
    
    // Handle null/undefined
    if (text === null || text === undefined) {
      text = '';
    }
    
    // Truncate if needed
    const truncated = text.length > maxLength;
    if (truncated) {
      text = text.substring(0, maxLength) + '\n...[truncated]';
    }

    // Include actual text in llmContent for display
    return {
      llmContent: `Extracted text content from "${selector}" (${text.length} characters)${truncated ? ' (truncated)' : ''}:\n${text}`,
      returnDisplay: `Text content from "${selector}" (${text.length} chars)${truncated ? ' - truncated' : ''}`,
      value: text,
    };
  }

  private async executeScreenshot(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    const screenshotOptions: Parameters<typeof page.screenshot>[0] = {};

    const type = getParam<'png' | 'jpeg'>(params, 'type');
    const quality = getParam<number>(params, 'quality');
    const fullPage = getParam<boolean>(params, 'fullPage');
    const clip = getParam<{ x: number; y: number; width: number; height: number }>(params, 'clip');
    const omitBackground = getParam<boolean>(params, 'omitBackground');

    if (type) screenshotOptions.type = type;
    if (quality) screenshotOptions.quality = quality;
    if (fullPage) screenshotOptions.fullPage = fullPage;
    if (clip) screenshotOptions.clip = clip;
    if (omitBackground) screenshotOptions.omitBackground = omitBackground;

    const screenshotBuffer = await page.screenshot(screenshotOptions);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = type === 'jpeg' ? 'jpg' : 'png';
    const fileName = `browser-screenshot-${timestamp}.${extension}`;
    const resolvedPath = path.resolve(this.config.getTargetDir(), fileName);
    await fs.writeFile(resolvedPath, screenshotBuffer);

    return {
      llmContent: `Screenshot saved to ${resolvedPath} (${screenshotBuffer.length} bytes)`,
      returnDisplay: `Screenshot saved to ${shortenPath(makeRelative(resolvedPath, this.config.getTargetDir()))} (${screenshotBuffer.length} bytes)`,
      screenshotPath: resolvedPath,
    };
  }

  private async executeClose(): Promise<BrowserControlResult> {
    const session = this.getSession();
    await session.close();
    globalSession = null;

    return {
      llmContent: 'Browser closed',
      returnDisplay: 'Browser closed',
    };
  }

  private async executeNewPage(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const context = session.getContext();
    if (!context) {
      throw new Error('No browser context available');
    }

    await this.ensureMaxPages(session);

    const url = getParam<string>(params, 'url');
    const newPage = await context.newPage();
    const pageId = session.registerPage(newPage);

    if (url) {
      if (!this.isUrlAllowed(url)) {
        throw new Error(`URL not allowed: ${url}. Check allowedOrigins configuration.`);
      }
      await newPage.goto(url, { timeout: this.browserConfig.navigationTimeout });
    }

    const result = await this.createPageResult(
      `New page opened${url ? ` and navigated to ${url}` : ''}`,
    );
    result.pageId = pageId;
    return result;
  }

  private async executeListPages(): Promise<BrowserControlResult> {
    const session = this.getSession();
    const pages = await session.listPages();

    return {
      llmContent: `Listed ${pages.length} page(s)`,
      returnDisplay: `Listed ${pages.length} page(s)`,
      pages,
    };
  }

  private async executeSwitchPage(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const pageId = getParam<string>(params, 'pageId');
    if (!pageId) {
      throw new Error('pageId is required for switchPage operation');
    }

    const switched = session.setActivePage(pageId);
    if (!switched) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const result = await this.createPageResult(`Switched to page ${pageId}`);
    result.pageId = pageId;
    return result;
  }

  private async executeClosePage(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const pageId = getParam<string>(params, 'pageId');
    const closed = await session.closePage(pageId);
    if (!closed) {
      throw new Error('No page found to close');
    }

    const result = await this.createPageResult(
      `Closed page${pageId ? ` ${pageId}` : ''}`,
    );
    result.pageId = session.getActivePageId() || undefined;
    return result;
  }

  private async executeGetCookies(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const context = session.getContext();
    if (!context) {
      throw new Error('No browser context available');
    }

    const urls = getParam<string[]>(params, 'urls');
    const cookies = await context.cookies(urls);

    return {
      llmContent: `Retrieved ${cookies.length} cookie(s)`,
      returnDisplay: `Retrieved ${cookies.length} cookie(s)`,
      cookies: cookies,
    };
  }

  private async executeSetCookie(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const context = session.getContext();
    if (!context) {
      throw new Error('No browser context available');
    }

    const name = getParam<string>(params, 'name');
    const value = getParam<string>(params, 'value');
    if (!name || !value) {
      throw new Error('Name and value are required for setCookie operation');
    }

    const cookie: Parameters<typeof context.addCookies>[0][number] = { name, value };
    const url = getParam<string>(params, 'url');
    const domain = getParam<string>(params, 'domain');
    const cookiePath = getParam<string>(params, 'path');
    const expires = getParam<number>(params, 'expires');
    const httpOnly = getParam<boolean>(params, 'httpOnly');
    const secure = getParam<boolean>(params, 'secure');
    const sameSite = getParam<'Strict' | 'Lax' | 'None'>(params, 'sameSite');

    if (url) cookie.url = url;
    if (domain) cookie.domain = domain;
    if (cookiePath) cookie.path = cookiePath;
    if (expires) cookie.expires = expires;
    if (httpOnly) cookie.httpOnly = httpOnly;
    if (secure) cookie.secure = secure;
    if (sameSite) cookie.sameSite = sameSite;

    await context.addCookies([cookie]);

    return {
      llmContent: `Cookie set: ${name}`,
      returnDisplay: `Cookie set: ${name}`,
    };
  }

  private async executeTracingStart(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const context = session.getContext();
    if (!context) {
      throw new Error('No browser context available');
    }

    const includeScreenshots = getParam<boolean>(params, 'screenshots', true);
    const includeSnapshots = getParam<boolean>(params, 'snapshots', true);
    const includeSources = getParam<boolean>(params, 'sources', true);

    await context.tracing.start({
      screenshots: includeScreenshots,
      snapshots: includeSnapshots,
      sources: includeSources,
    });

    return {
      llmContent: 'Tracing started',
      returnDisplay: 'Tracing started',
      tracingStatus: 'started',
    };
  }

  private async executeTracingStop(params: Record<string, unknown>): Promise<BrowserControlResult> {
    const session = this.getSession();
    const context = session.getContext();
    if (!context) {
      throw new Error('No browser context available');
    }

    const outputPath = getParam<string>(params, 'path');
    if (!outputPath) {
      throw new Error('path is required for tracingStop operation');
    }

    const resolvedPath = path.resolve(this.config.getTargetDir(), outputPath);
    if (!isSubpath(this.config.getTargetDir(), resolvedPath)) {
      throw new Error('Tracing output path must be within the workspace root');
    }
    await context.tracing.stop({ path: resolvedPath });

    const relativePath = shortenPath(makeRelative(resolvedPath, this.config.getTargetDir()));

    return {
      llmContent: `Tracing stopped. Saved to ${resolvedPath}`,
      returnDisplay: `Tracing stopped. Saved to ${relativePath}`,
      tracingStatus: 'stopped',
    };
  }

  private async executeAcceptDialog(): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    return {
      llmContent: 'Dialog accepted',
      returnDisplay: 'Dialog accepted',
    };
  }

  private async executeDismissDialog(): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();
    if (!page) {
      throw new Error('No page available');
    }

    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    return {
      llmContent: 'Dialog dismissed',
      returnDisplay: 'Dialog dismissed',
    };
  }

  private async createPageResult(action: string): Promise<BrowserControlResult> {
    const session = this.getSession();
    const page = session.getPage();

    if (!page) {
      return {
        llmContent: action,
        returnDisplay: action,
      };
    }

    const pageUrl = page.url();
    const pageTitle = await page.title();
    const pageId = session.getActivePageId() || undefined;

    return {
      llmContent: `${action}${pageUrl ? ` (${pageUrl})` : ''}`,
      returnDisplay: `${action}${pageTitle ? ` - ${pageTitle}` : ''}`,
      pageUrl,
      pageTitle,
      pageId,
    };
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return false;
    }

    const operation = this.params.operation;

    // Operations that modify state or navigate
    const requiresApproval = [
      'goto',
      'fill',
      'click',
      'check',
      'uncheck',
      'setCookie',
      'close',
      'type',
      'selectOption',
      'newPage',
      'closePage',
      'switchPage',
      'tracingStart',
      'tracingStop',
    ];

    if (!requiresApproval.includes(operation)) {
      return false;
    }

    return {
      type: 'info',
      title: `Confirm Browser Operation`,
      prompt: `Perform browser operation: ${operation}\n\nParameters:\n${JSON.stringify(this.params.params, null, 2)}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
  }
}

/**
 * Browser Control Tool - provides automated browser control using Playwright
 */
export class BrowserControlTool extends BaseDeclarativeTool<
  BrowserControlParams,
  BrowserControlResult
> {
  static readonly Name = 'browser_control';

  constructor(private readonly config: Config) {
    super(
      BrowserControlTool.Name,
      'Browser Control',
      `Automated browser control using Playwright for web navigation, interaction, and content extraction.

This tool provides comprehensive browser automation capabilities including:
- Navigate to URLs and manage page history
- Locate elements by role, text, label, placeholder, or test ID
- Fill forms, click buttons, check checkboxes
- Extract text content from elements (handles Shadow DOM automatically)
- Execute JavaScript in the browser context
- Capture screenshots of pages or specific elements
- Manage cookies and browser contexts
- Manage multiple pages in a single session
- Capture tracing artifacts for debugging

Key features:
- Auto-waiting for element actionability (no manual waits needed)
- Support for Chromium, Firefox, and WebKit browsers
- Isolated browser contexts for clean state between operations
- Screenshot capture in PNG or JPEG format

Usage notes:
- The browser is launched once per session and reused
- Use specific selectors (getByRole, getByText) for reliable element location
- Screenshots are saved to PNG files in the workspace and the path is returned
- Navigation timeouts default to 30 seconds but can be configured
- Use listPages/switchPage/closePage to manage multi-page flows
- Tracing output paths are resolved relative to the workspace root

**Best practices (from testing):**
- **Text extraction works reliably**: Use the textContent operation to extract page content - it returns readable text from any element
- **Prefer direct navigation over clicking**: Modern sites (Reddit, etc.) often have overlay elements that intercept pointer events, causing clicks to fail. Instead of clicking through to posts/articles, use goto to navigate directly to URLs
- **Finding elements works, clicking is tricky**: getByRole and getByText can locate elements reliably, but actual clicks may fail due to overlay intercepts
- **Watch for site blocking**: Many sites (NYTimes, etc.) use geo-blocking/CAPTCHA that blocks automated browsers entirely
- **Workaround for click failures**: When click fails due to overlays, find the target URL in the page content and navigate directly with goto instead

Example operations:
1. Navigate: { "operation": "goto", "params": { "url": "https://example.com" } }
2. Fill form: { "operation": "fill", "params": { "selector": "input[name='email']", "value": "user@example.com" } }
3. Click: { "operation": "click", "params": { "selector": "button[type='submit']" } }
4. Screenshot: { "operation": "screenshot", "params": { "type": "png", "fullPage": true } }
5. Execute JS: { "operation": "evaluate", "params": { "script": "document.title" } }
6. List pages: { "operation": "listPages" }
7. Switch page: { "operation": "switchPage", "params": { "pageId": "page-1" } }
8. Start tracing: { "operation": "tracingStart", "params": { "screenshots": true } }
9. Stop tracing: { "operation": "tracingStop", "params": { "path": "artifacts/trace.zip" } }

Security:
- External URLs may be restricted based on configuration
- Screenshot sizes are limited to prevent resource exhaustion
- Browser context is isolated per operation group`,
      Kind.Browser,
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: [
              'goto',
              'reload',
              'goBack',
              'goForward',
              'locator',
              'getByRole',
              'getByText',
              'getByLabel',
              'getByPlaceholder',
              'getByAltText',
              'getByTitle',
              'getByTestId',
              'fill',
              'type',
              'clear',
              'check',
              'uncheck',
              'selectOption',
              'click',
              'dblclick',
              'evaluate',
              'evaluateHandle',
              'textContent',
              'screenshot',
              'close',
              'newPage',
              'listPages',
              'switchPage',
              'closePage',
              'getCookies',
              'setCookie',
              'acceptDialog',
              'dismissDialog',
              'tracingStart',
              'tracingStop',
            ],
            description: 'The browser operation to perform',
          },
          params: {
            type: 'object',
            description: 'Operation-specific parameters',
          },
        },
        required: ['operation'],
      },
    );
  }

  protected createInvocation(
    params: BrowserControlParams,
  ): ToolInvocation<BrowserControlParams, BrowserControlResult> {
    return new BrowserControlToolInvocation(this.config, params);
  }
}
