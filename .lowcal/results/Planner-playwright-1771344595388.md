I'll research browser automation options for LowCal and produce a comprehensive spec sheet for implementing Playwright-based browser control.

Now I'll create the comprehensive implementation specification document for the browser control tool using Playwright.

---
## RETURN_PAYLOAD: Browser Control Tool Specification Complete
I've completed the research and created a comprehensive implementation spec sheet for browser automation using Playwright.
### Summary:
**Document Created:** `/home/atmandk/LowCal-dev/docs/browser-control-spec.md`
**Key Findings:**
- **Playwright selected** over Puppeteer/Selenium due to cross-browser support, modern locator API, auto-waiting, and active Microsoft development
- Tool will integrate with LowCal's existing `BaseDeclarativeTool` pattern
- Single browser instance per session with isolated contexts for clean state
**Spec Highlights:**
1. **20+ operations** covering navigation, element selection, form interactions, JS execution, screenshots, cookies, and dialog handling
2. **Approval mode integration** - prompts for destructive actions (navigation, form filling)
3. **Security controls** - URL filtering, resource limits (5MB screenshot cap, 10 pages/session max)
4. **Configuration options** - headless/slowMo/devtools toggles, timeout settings
**Implementation Steps:**
1. Add `Kind.Browser` tool kinds
2. Create `browser-control.ts` extending `BaseDeclarativeTool`
3. Register in `config.ts` via `registerCoreTool()`
4. Update `tool-names.ts` with `BROWSER_CONTROL` constant
5. Add tests mirroring existing tool patterns
Ready for implementation when you are, Darrin. The Death Star's plans were more complex than this spec sheet.