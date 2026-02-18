# Browser Control Tool Specification

**Version:** 1.0  
**Date:** 2026-02-17  
**Implementation Target:** LowCal Core Package  
**Technology:** Playwright (Node.js)

---

## Executive Summary

This document specifies the implementation of a browser automation tool for LowCal using Microsoft's Playwright library. The tool will enable the LLM to programmatically control web browsers for tasks including:

- Web page navigation and content extraction
- Form filling and submission
- Element interaction (click, type, hover)
- Screenshot capture
- JavaScript execution in browser context

*"The Empire built droids that could fly starfighters. We'll build one that can navigate a login form."*

---

## 1. Technology Selection Rationale

### Comparison of Options

| Feature | Playwright | Puppeteer | Selenium |
|---------|-----------|-----------|----------|
| Cross-browser (Chromium/Firefox/WebKit) | ✅ Native support | ❌ Chromium only | ✅ Via drivers |
| Modern API | ✅ Locator-based | ✅ Element-based | ⚠️ Verbose |
| Auto-waiting | ✅ Built-in | ✅ Built-in | ❌ Manual waits |
| Headless/Headful | ✅ Seamless toggle | ✅ Seamless toggle | ✅ Possible |
| Mobile emulation | ✅ Built-in | ❌ Limited | ✅ Via drivers |
| TypeScript support | ✅ First-class | ✅ Good | ⚠️ Third-party |
| Active development | ✅ Microsoft | ✅ Google | ⚠️ Slower |
| 2026 recommendation | ✅ **Best choice** | ✅ Good for Chrome-only | ⚠️ Legacy |

### Why Playwright?

1. **Cross-browser by default** - Supports Chromium, Firefox, and WebKit without additional configuration
2. **Modern locator API** - `getByRole()`, `getByText()` provide resilient element selection
3. **Auto-waiting** - No need for explicit waits; Playwright waits for actionability automatically
4. **TypeScript-first** - First-class TypeScript support with excellent type definitions
5. **Active development** - Microsoft maintains Playwright with regular updates and new features

---

## 2. Tool Architecture

### 2.1 Component Structure

```
packages/core/src/tools/
├── browser-control.ts          # Main tool implementation
├── browser-control.test.ts     # Unit tests
└── __snapshots__/              # Test snapshots for screenshots
```

### 2.2 Integration Points

The browser control tool integrates with:

- **ToolRegistry** (`packages/core/src/config/config.ts`) - Registration and lifecycle management
- **Config** - Browser launch options, timeout settings, approval mode
- **Approval System** - Confirmation prompts for destructive actions
- **LLM Prompting** - Tool schema and examples for the model

### 2.3 Tool Kind Classification

```typescript
Kind.Browser  // New kind for browser automation tools
```

---

## 3. Tool Specification

### 3.1 Tool Name

**Internal name:** `browser_control`  
**Display name:** `BrowserControl`  
**Description:** "Automated browser control using Playwright for web navigation, interaction, and content extraction"

### 3.2 Browser Lifecycle Management

The tool manages a single browser instance per session with the following lifecycle:

```
Session Start
    ↓
Browser Launch (chromium by default)
    ↓
Context Creation (isolated context)
    ↓
Page Operations (multiple pages possible)
    ↓
Context Close → Browser Close
    ↓
Session End
```

**Key Design Decisions:**

1. **Single browser instance per session** - Reduces resource usage and launch overhead
2. **Isolated contexts** - Each "session" within the browser uses a new context for cookie/cache isolation
3. **Graceful cleanup** - Browser closes on session end or explicit `close` command

### 3.3 Supported Operations

#### Navigation

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `goto` | `{ url: string, waitUntil?: 'load'\|'domcontentloaded'\|'networkidle', timeout?: number }` | Navigate to URL |
| `reload` | `{ timeout?: number, waitUntil?: 'load'\|'domcontentloaded' }` | Reload current page |
| `goBack` | `{ timeout?: number }` | Navigate back in history |
| `goForward` | `{ timeout?: number }` | Navigate forward in history |

#### Element Selection

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `locator` | `{ selector: string, hasText?: string }` | Create locator for element |
| `getByRole` | `{ role: ARIARole, name?: string, checked?: boolean }` | Locate by ARIA role |
| `getByText` | `{ text: string, exact?: boolean }` | Locate by text content |
| `getByLabel` | `{ text: string, exact?: boolean }` | Locate by label |
| `getByPlaceholder` | `{ text: string, exact?: boolean }` | Locate by placeholder |
| `getByAltText` | `{ text: string, exact?: boolean }` | Locate images by alt text |
| `getByTitle` | `{ text: string, exact?: boolean }` | Locate by title attribute |
| `getByTestId` | `{ testId: string }` | Locate by data-testid |

#### Form Interactions

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `fill` | `{ selector: string, value: string, force?: boolean }` | Fill input/textarea |
| `type` | `{ selector: string, text: string, delay?: number }` | Type with keyboard events |
| `clear` | `{ selector: string, force?: boolean }` | Clear input field |
| `check` | `{ selector: string, position?: { x, y }, force?: boolean }` | Check checkbox/radio |
| `uncheck` | `{ selector: string, position?: { x, y }, force?: boolean }` | Uncheck checkbox |
| `selectOption` | `{ selector: string, values: string[], index?: number, value?: string, label?: string }` | Select from dropdown |

#### Click Actions

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `click` | `{ selector: string, button?: 'left'\|'right', clickCount?: number, delay?: number, force?: boolean, modifiers?: Array<'Alt'\|'Control'\|'Shift'>, position?: { x, y } }` | Click element |
| `dblclick` | `{ selector: string, button?: 'left', delay?: number, force?: boolean, position?: { x, y } }` | Double-click element |

#### JavaScript Execution

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `evaluate` | `{ script: string, args?: any[] }` | Execute JS in browser context |
| `evaluateHandle` | `{ script: string, args?: any[] }` | Execute and return JSHandle |

#### Screenshot Capture

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `screenshot` | `{ path?: string, type?: 'png'\|'jpeg', quality?: number, fullPage?: boolean, clip?: { x, y, width, height }, omitBackground?: boolean }` | Take screenshot of viewport or element |

#### Page Management

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `close` | `{}` | Close current page and context |
| `newPage` | `{ url?: string }` | Open new page in same context |

#### Cookie Management

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `getCookies` | `{ urls?: string[] }` | Get cookies for URL(s) |
| `setCookie` | `{ name: string, value: string, url?: string, domain?: string, path?: string, expires?: number, httpOnly?: boolean, secure?: boolean, sameSite?: 'Strict'\|'Lax'\|'None' }` | Set cookie |

#### Dialog Handling

| Operation | Parameters | Description |
|-----------|------------|-------------|
| `acceptDialog` | `{}` | Accept JavaScript dialog (alert/confirm/prompt) |
| `dismissDialog` | `{}` | Dismiss JavaScript dialog |

### 3.4 Configuration Options

```typescript
interface BrowserControlConfig {
  // Browser launch options
  headless?: boolean;              // Default: true in production, false in debug
  slowMo?: number;                 // Slow down operations by X ms for debugging
  devtools?: boolean;              // Open DevTools (headful only)
  
  // Timeout settings (milliseconds)
  navigationTimeout?: number;      // Default: 30000
  actionTimeout?: number;          // Default: 15000
  
  // Resource limits
  maxPagesPerSession?: number;     // Default: 10
  maxScreenshotSize?: number;      // Default: 5MB
  
  // Allowed origins (security)
  allowedOrigins?: string[];       // If set, only allow these domains
  blockExternal?: boolean;         // Block non-allowed origins
  
  // Sandbox settings
  sandbox?: boolean;               // Enable Chromium sandboxing
}
```

---

## 4. Implementation Details

### 4.1 File Structure

```typescript
// packages/core/src/tools/browser-control.ts

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Config } from '../config/config.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';

// Types
export interface BrowserControlParams {
  operation: string;
  params?: Record<string, unknown>;
}

export interface BrowserControlResult extends ToolResult {
  pageUrl?: string;
  pageTitle?: string;
  screenshotPath?: string;  // Path to saved screenshot (if any)
}

// Invocation class
class BrowserControlInvocation extends BaseToolInvocation<
  BrowserControlParams,
  BrowserControlResult
> {
  constructor(
    private readonly config: Config,
    params: BrowserControlParams,
  ) {
    super(params);
  }

  async execute(signal: AbortSignal): Promise<BrowserControlResult> {
    // Implementation details in Section 4.3
  }
}

// Tool class
export class BrowserControlTool extends BaseDeclarativeTool<
  BrowserControlParams,
  BrowserControlResult
> {
  static readonly Name = 'browser_control';

  constructor(private readonly config: Config) {
    super(
      BrowserControlTool.Name,
      'Browser Control',
      // Description (see Section 4.2)
      Kind.Browser,
      // Schema (see Section 4.3)
    );
  }

  protected createInvocation(
    params: BrowserControlParams,
  ): ToolInvocation<BrowserControlParams, BrowserControlResult> {
    return new BrowserControlInvocation(this.config, params);
  }
}
```

### 4.2 Tool Description for LLM

```typescript
description = `Automated browser control using Playwright for web navigation, interaction, and content extraction.

This tool provides comprehensive browser automation capabilities including:
- Navigate to URLs and manage page history
- Locate elements by role, text, label, placeholder, or test ID
- Fill forms, click buttons, check checkboxes
- Execute JavaScript in the browser context
- Capture screenshots of pages or specific elements
- Manage cookies and browser contexts
- Manage multiple pages and tracing

Key features:
- Auto-waiting for element actionability (no manual waits needed)
- Support for Chromium, Firefox, and WebKit browsers
- Isolated browser contexts for clean state between operations
- Screenshot capture in PNG or JPEG format
- Operation timing appended to output

Usage notes:
- The browser is launched once per session and reused
- Use specific selectors (getByRole, getByText) for reliable element location
- Screenshots are saved to PNG files under the workspace root and the path is returned
- Navigation timeouts default to 30 seconds but can be configured
- Tracing outputs are written under the workspace root

**Best practices (learned from testing):**
- **Text extraction works reliably**: Use `textContent` operation with selector (e.g., "body") to extract page content - it returns readable text
- **Prefer direct navigation over clicking**: Instead of clicking through overlays, use `goto` to navigate directly to post/article URLs - modern sites often have overlay elements that intercept clicks
- **Finding elements works, clicking is tricky**: `getByRole` and `getByText` locate elements reliably, but clicking may fail due to overlay intercepts
- **Watch for site blocking**: Many sites (NYTimes, etc.) use geo-blocking/CAPTCHA that blocks automated browsers - Reddit works well for text extraction
- **Workaround for click failures**: When click fails due to overlays, find the target URL in the page and navigate directly with `goto`

Example operations:
1. Navigate: { "operation": "goto", "params": { "url": "https://example.com" } }
2. Fill form: { "operation": "fill", "params": { "selector": "input[name='email']", "value": "user@example.com" } }
3. Click: { "operation": "click", "params": { "selector": "button[type='submit']" } }
4. Screenshot: { "operation": "screenshot", "params": { "type": "png", "fullPage": true } }
5. Execute JS: { "operation": "evaluate", "params": { "script": "document.title" } }
6. Start tracing: { "operation": "tracingStart", "params": { "screenshots": true } }
7. Stop tracing: { "operation": "tracingStop", "params": { "path": "artifacts/trace.zip" } }

Security:
- External URLs may be restricted based on configuration
- Screenshot sizes are limited to prevent resource exhaustion
- Browser context is isolated per operation group`;
```

### 4.3 JSON Schema

```typescript
parameterSchema = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: [
        'goto', 'reload', 'goBack', 'goForward',
        'locator', 'getByRole', 'getByText', 'getByLabel', 'getByPlaceholder',
        'getByAltText', 'getByTitle', 'getByTestId',
        'fill', 'type', 'clear', 'check', 'uncheck', 'selectOption',
        'click', 'dblclick', 'dragAndDrop',
        'evaluate', 'evaluateHandle',
        'screenshot',
        'close', 'newPage',
        'getCookies', 'setCookie',
        'acceptDialog', 'dismissDialog'
      ],
      description: 'The browser operation to perform'
    },
    params: {
      type: 'object',
      description: 'Operation-specific parameters'
    }
  },
  required: ['operation']
};
```

### 4.4 Operation Parameter Schemas

#### Navigation Operations

```typescript
// goto
{
  url: { type: 'string', pattern: '^https?://' },
  waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] },
  timeout: { type: 'number', minimum: 1000, maximum: 300000 }
}

// reload
{
  timeout: { type: 'number', minimum: 1000, maximum: 300000 },
  waitUntil: { type: 'string', enum: ['load', 'domcontentloaded'] }
}
```

#### Element Selection

```typescript
// locator
{ selector: { type: 'string' }, hasText: { type: 'string' } }

// getByRole
{
  role: { type: 'string', enum: ['button', 'link', 'textbox', 'checkbox', ...] },
  name: { type: 'string' }
}

// text-based locators
{ text: { type: 'string' }, exact: { type: 'boolean' } }
```

#### Form Operations

```typescript
// fill
{
  selector: { type: 'string' },
  value: { type: 'string' },
  force: { type: 'boolean' }
}

// selectOption
{
  selector: { type: 'string' },
  values: { type: 'array', items: { type: 'string' } },
  index: { type: 'number' },
  value: { type: 'string' },
  label: { type: 'string' }
}
```

#### Screenshot

```typescript
{
  path: { type: 'string' },  // Optional file path to save
  type: { type: 'string', enum: ['png', 'jpeg'], default: 'png' },
  quality: { type: 'number', minimum: 1, maximum: 100 },
  fullPage: { type: 'boolean' },
  clip: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' }
    }
  },
  omitBackground: { type: 'boolean' }
}
```

### 4.5 Implementation Logic

```typescript
// Browser state management
class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async ensureInitialized(): Promise<void> {
    if (!this.browser) {
      const headless = !this.config.getDebugMode();
      this.browser = await chromium.launch({ headless });
    }
    
    if (!this.context) {
      this.context = await this.browser.newContext();
    }
    
    if (!this.page) {
      this.page = await this.context.newPage();
    }
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
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
```

### 4.6 Approval Mode Integration

```typescript
override async shouldConfirmExecute(
  abortSignal: AbortSignal
): Promise<ToolCallConfirmationDetails | false> {
  if (this.config.getApprovalMode() === ApprovalMode.YOLO) {
    return false;
  }

  const operation = this.params.operation;
  
  // Operations that modify state or navigate
  const requiresApproval = [
    'goto', 'fill', 'click', 'check', 'uncheck',
    'setCookie', 'close'
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
    }
  };
}
```

---

## 5. Security Considerations

### 5.1 URL Filtering

```typescript
private isUrlAllowed(url: string): boolean {
  const allowedOrigins = this.config.getAllowedOrigins();
  
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;  // No restrictions
  }

  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return allowedOrigins.some(allowed => 
      origin === allowed || origin.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}
```

### 5.2 Resource Limits

- **Maximum pages per session:** 10
- **Maximum screenshot size:** 5MB (base64-encoded)
- **Navigation timeout:** 30 seconds (configurable)
- **Action timeout:** 15 seconds (configurable)

### 5.3 Sandbox Mode

```typescript
// In browser launch options
{
  sandbox: true,  // Enable Chromium sandboxing
  args: [
    '--no-sandbox',      // Disable for Docker environments
    '--disable-setuid-sandbox',
    '--no-zygote'        // Single process mode
  ]
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
// packages/core/src/tools/browser-control.test.ts

describe('BrowserControlTool', () => {
  let tool: BrowserControlTool;
  let config: Config;

  beforeEach(() => {
    config = createMockConfig();
    tool = new BrowserControlTool(config);
  });

  describe('goto operation', () => {
    it('should navigate to URL and return page info', async () => {
      const result = await executeOperation(tool, 'goto', { url: 'https://example.com' });
      expect(result.pageUrl).toBe('https://example.com');
      expect(result.returnDisplay).toContain('Navigated to');
    });

    it('should reject invalid URLs', async () => {
      await expect(executeOperation(tool, 'goto', { url: 'invalid-url' }))
        .rejects.toThrow();
    });
  });

  describe('element selection', () => {
    it('should locate element by role', async () => {
      const result = await executeOperation(tool, 'getByRole', {
        role: 'button',
        name: 'Submit'
      });
      expect(result.locator).toBeDefined();
    });
  });

  describe('form operations', () => {
    it('should fill input field', async () => {
      const result = await executeOperation(tool, 'fill', {
        selector: '#email',
        value: 'test@example.com'
      });
      expect(result.returnDisplay).toContain('Filled');
    });
  });

  describe('screenshot', () => {
    it('should capture screenshot and return base64 data', async () => {
      const result = await executeOperation(tool, 'screenshot', {
        type: 'png',
        fullPage: true
      });
      expect(result.screenshot).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('JavaScript execution', () => {
    it('should evaluate JS and return result', async () => {
      const result = await executeOperation(tool, 'evaluate', {
        script: 'document.title'
      });
      expect(result.value).toBeDefined();
    });
  });
});
```

### 6.2 Integration Tests

- Test with real web pages (example.com, httpbin.org)
- Test with authentication flows
- Test with dynamic content (SPA frameworks)

---

## 7. Configuration Example

```jsonc
// .qwen/config.json
{
  "browserControl": {
    "headless": true,
    "slowMo": 0,
    "devtools": false,
    "navigationTimeout": 30000,
    "actionTimeout": 15000,
    "maxPagesPerSession": 10,
    "maxScreenshotSize": 5242880,
    "allowedOrigins": [
      "https://example.com",
      "https://api.example.com"
    ],
    "blockExternal": false
  }
}
```

---

## 8. Migration Path

### Phase 1: Core Implementation
- [ ] Create `browser-control.ts` with basic operations
- [ ] Implement browser lifecycle management
- [ ] Add unit tests for all operations
- [ ] Update tool registry in config.ts

### Phase 2: Advanced Features
- [ ] Implement cookie management
- [ ] Add dialog handling
- [ ] Support multiple pages per context
- [ ] Add tracing capabilities

### Phase 3: Polish
- [x] Optimize screenshot handling (skip base64 when exceeding size limit, suggest clip)
- [x] Add performance metrics (operation timing included in tool output)
- [x] Improve error messages and debugging info (operation-specific errors)
- [x] Documentation updates

---

## 9. Future Enhancements

1. **Multi-page support** - Manage multiple pages within a context
2. **Network interception** - Mock API responses, block resources
3. **Mobile emulation** - Test responsive designs
4. **Video recording** - Record browser sessions
5. **Performance metrics** - LCP, FID, CLS tracking

---

## Appendix A: Dependencies

```json
{
  "dependencies": {
    "@playwright/test": "^1.48.0"
  },
  "devDependencies": {
    "@types/playwright": "^1.48.0"
  }
}
```

Install with:
```bash
npm install @playwright/test@^1.48.0
npx playwright install chromium
```

---

## Appendix B: Example LLM Prompt

```
The user wants to navigate to https://example.com/login and fill out the login form.

I'll use the browser_control tool to:
1. Navigate to the login page
2. Locate the email input field by its label or placeholder
3. Fill in the email address
4. Locate the password field
5. Fill in the password
6. Click the submit button

Let me start by navigating to the page...
```

---

*"The Force is strong with this one. But so is Playwright."*
