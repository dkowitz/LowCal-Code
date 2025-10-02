### User Message

Ok, now I want to revisit the problem of tables in the cli truncating text.  It happens almost all the time, and makes the table almost useless as its intended information is unavailble to fully read.  I want you to formulate a way to modify the rendering engine to fix this and implement true multi-line/wrap for tables.  Present a plan of how to do this.

---

### Tool Execution

**Tool:** ExitPlanMode

---

## User Message

Ok, now I want to revisit the problem of tables in the cli truncating text.  It happens almost all the time, and makes the table almost useless as its intended information is unavailble to fully read.  I want you to formulate a way to modify the rendering engine to fix this and implement true multi-line/wrap for tables.  Present a plan of how to do this.

---

## Assistant Response

**Goal**  
Replace the current single‑line truncation in `packages/cli/src/ui/utils/TableRenderer.tsx` with true multi‑line word‑wrap so every cell can display its full content (including markdown) without being cut off.

---

---

## Assistant Response

### 1️⃣ Understand the existing implementation
- **Column width calculation** – uses `getPlainTextLength` on raw header / cell strings, adds padding, then scales if total width > terminal width.
- **Truncation** – if a cell’s plain‑text length exceeds its allotted width, a binary search finds the longest prefix that fits and appends `"…"`.
- **Rendering** – each row is rendered as one `<Text>` line with vertical borders (`│`).

---

## Assistant Response

### 2️⃣ Add a reusable wrap utility
Create `wrapCell(content: string, maxWidth: number): string[]` that:
1. Calls `getPlainTextLength` on the whole string to know its display width.
2. Splits the content into words (respecting whitespace).  
   - If a single word’s length > `maxWidth`, break it character‑wise.
3. Builds lines until adding another word would exceed `maxWidth`.  
4. Returns an array of wrapped strings **preserving the original markdown** (the wrapper does not modify markup; each line will later be fed to `<RenderInline>` which re‑parses markdown).

---

## Assistant Response

### 3️⃣ Adjust column width logic
- Keep the initial width calculation as a *maximum* based on the longest unwrapped cell, then apply the existing scaling factor.
- After scaling we know `contentWidth` for each column.  
- For every cell, call `wrapCell(cellContent, contentWidth - 2)` (subtract padding) to get its wrapped lines.

---

## Assistant Response

### 4️⃣ Render rows with variable height
1. For a given row, obtain the wrapped line arrays of all cells.
2. Determine `rowHeight = max(wrappedLines[i].length for each cell i)`.
3. Loop `lineIdx` from 0 to `rowHeight‑1` and render a `<Text>` line:
   - For each column:  
     *If the cell has a line at `lineIdx`, render it via `<RenderInline>`; otherwise render an empty string.*  
   - Pad each rendered line to exactly `contentWidth` using spaces (`' '.repeat(padding)`).
4. Surround each line with vertical borders (`│`) just like the current single‑line version.
5. The top, middle, and bottom border rendering stays unchanged.

---

## Assistant Response

### 5️⃣ Header handling
- Run headers through the same wrap utility (they’ll normally stay one line).  
- Render header rows using the multi‑line loop; this keeps the code path uniform.

---

## Assistant Response

### 6️⃣ Update styling & edge cases
- Preserve existing bold/color for headers (`<Text bold color={Colors.AccentCyan}>`).  
- Ensure that markdown inside wrapped lines (e.g., backticks, links) is still rendered correctly because each line is passed through `<RenderInline>` again.
- If a cell contains newline characters already, treat them as explicit line breaks before wrapping.

---

## Assistant Response

### 7️⃣ Testing
Add/extend tests in `packages/cli/src/ui/utils/TableRenderer.test.tsx`:

---

## Assistant Response

| Test case | Description |
|----------|-------------|
| Long plain text | Cell longer than terminal width → expect wrapped lines, no `"…"`. |
| Markdown with backticks | Verify formatting is retained on each wrapped line. |
| Word longer than column width | Ensure the word is split correctly (character‑wise). |
| Mixed short/long cells in same row | Row height equals longest cell; shorter cells padded correctly. |
| Terminal resize simulation | Change `terminalWidth` prop and assert columns re‑scale and wrap accordingly. |

---

## Assistant Response

Run the project’s test suite (`npm run test --workspaces`) to confirm no regressions.

---

## Assistant Response

### 8️⃣ Lint / Type‑check
- After code changes, run `npm run lint` and `npm run typecheck`.  
- Ensure all new functions are typed (e.g., `wrapCell(content: string, maxWidth: number): string[]`).

---

## Assistant Response

### 9️⃣ Documentation
- Update the comment block at the top of `TableRenderer.tsx` to describe the new wrapping behavior.  
- Optionally add a note in the CLI README about how tables now wrap instead of truncating.

---

---

## Assistant Response

## Risks & Mitigations

---

## Assistant Response

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Performance** – wrapping every cell on each render could be costly for huge tables. | UI lag on very large outputs. | Use simple loops, memoize `getPlainTextLength` results per render cycle; only wrap once per cell per render. |
| **Markdown breakage** – splitting inside a markdown token (e.g., `[link](url)`) might produce malformed markup on a line. | Visual glitches in rendered text. | Because each wrapped line is re‑parsed by `<RenderInline>`, the markup will be interpreted correctly even if split; ensure we don’t cut off escape sequences (`\x1b[`), which are stripped by `getPlainTextLength` anyway. |
| **Terminal resize** – column widths may become stale after a resize event. | Misaligned tables. | The component already recomputes on each render (receives `terminalWidth` prop); our logic follows the same pattern, so resizing will trigger re‑wrap automatically. |
| **Breaking existing tests** | CI failures. | Add/adjust tests to reflect new behavior; run full test suite before committing. |

---

---

## Assistant Response

## Deliverables

---

## Assistant Response

1. Updated `TableRenderer.tsx` with multi‑line wrap implementation.  
2. New helper `wrapCell`.  
3. Expanded unit‑test coverage for wrapping scenarios.  
4. Lint and type‑check passing.  
5. Updated documentation/comments.

---

---

## Assistant Response

**Next step** – If you approve this plan, I will create a detailed todo list (one item per major step) and begin implementation, marking each task as *in_progress* and *completed* while running the project's lint/typecheck/tests after every change.

---

