---
description: Watch the running Next.js app and silently auto-fix any error that appears while I browse the site.
---

// turbo-all

# Watch Errors (silent auto-fix mode)

## Output rules (strict)
- Do NOT explain, list errors, show plans, or write summaries.
- Do NOT ask me questions.
- You may write ONLY these messages, exactly as written:
  - At start: 👀
  - When errors are detected (so I stop clicking): ⏸
  - After fixing: تم حل المشاكل
  - Dev server not running: السيرفر غير شغال، شغّل npm run dev
  - Error not fixable after 2 attempts: تعذر حل مشكلة في <file path>
- Never write anything else.

## Steps
1. Call the next-devtools MCP tool `nextjs_index` to find the running Next.js dev server. If none is found, write the "server not running" message and stop.
2. Write: 👀
3. Loop:
   a. Call `nextjs_call` with toolName `get_errors`.
   b. If there are no errors, wait 15 seconds by running this command, then go back to (a):
      node -e "setTimeout(()=>{},15000)"
   c. If errors exist:
      - Write: ⏸
      - Wait 5 seconds (same command with 5000) so the errors finish appearing, then call `get_errors` again to get the full list.
      - Follow every step of /fix-errors silently (its output rules apply).
      - When `get_errors` is empty, write: تم حل المشاكل
      - Go back to (a).
4. Stop watching (silently, no summary) when:
   - 40 empty checks happen in a row (about 10 minutes of no errors), or
   - I write: وقف
