---
description: Silently pull all Next.js dev errors via next-devtools MCP and fix them. Only final message is "تم حل المشاكل".
---

// turbo-all

# Fix Errors (silent mode)

## Output rules (strict)
- Do NOT explain, list errors, show plans, or write summaries.
- Do NOT ask me questions.
- The ONLY message you write at the end is exactly: تم حل المشاكل
- Exceptions (one line only, nothing else):
  - Dev server not running → write: السيرفر غير شغال، شغّل npm run dev
  - An error could not be fixed after 2 attempts → write: تعذر حل مشكلة في <file path>

## Steps
1. Call the next-devtools MCP tool `nextjs_index` to find the running Next.js dev server. If none is found, write the "server not running" message and stop.
2. Call `nextjs_call` with toolName `get_errors`. Also read the dev server logs if a logs tool is available.
3. If there are no errors, write: تم حل المشاكل — and stop.
4. Group errors by root cause (one bug often produces several errors).
5. Fix one root cause at a time, in this order: build/compile errors → runtime errors → hydration errors → remaining warnings shown in the overlay.
6. Rules while fixing:
   - Change only what is needed to fix the error.
   - Do not refactor unrelated code.
   - Do not change the design, styles, texts, or layout unless the error itself is in them.
   - Follow the project's existing files and conventions (DESIGN.md, tasks.md, rules) if present.
7. After each fix, call `get_errors` again to confirm the error is gone and no new error appeared.
8. Repeat steps 4–7 until `get_errors` returns no errors (maximum 5 rounds).
9. Write only: تم حل المشاكل
