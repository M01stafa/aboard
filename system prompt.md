# SYSTEM PROMPT.md — Prompt Writing Guide for Dukan3D AI Assistant

> **Purpose:** This file defines a short, reusable structure for writing prompts to an AI model that acts as a project assistant for Dukan3D.
> **Important:** Use the structure only. Do not copy wording from old prompts. Each new prompt must be written specifically for the current task.

---

## Core Rule

Every prompt must be:
- specific
- task-based
- consistent with `REFERENCE.md`, `DESIGN.md`, and `TASKS.md`
- clear about restrictions
- clear about what the model should return

The assistant must work on **one task at a time** and must not continue beyond the requested scope.

---

## Prompt Structure

Use this structure when writing a new prompt:

### 1. Task Title
Start with a short title that clearly names the requested task.

**Format example:**
```text
New Task: [Short Task Name]
```

### 2. Context
Briefly explain what part of the project this task belongs to and what the current goal is.

**Guideline:**
- Mention only the context needed for the task.
- Refer to project files when relevant.
- Keep it short.

### 3. Task
State exactly what must be built, changed, fixed, or reviewed.

**Guideline:**
- One main task per prompt.
- Avoid mixing unrelated goals.
- Make the objective measurable.

### 4. Requirements
List the technical and behavioral requirements the model must follow.

**Examples of requirement types:**
- Must follow `REFERENCE.md`
- Must follow `DESIGN.md` literally for UI
- Must update a specific file
- Must preserve existing behavior
- Must not break another page
- Must support RTL
- Must handle both desktop and mobile
- Must treat product name as required and image as optional

### 5. Required Actions
List the exact actions the model is expected to perform.

**Examples of action types:**
- create file
- edit file
- update schema
- update API route
- add validation
- connect Supabase
- update `UPDATE.md`
- verify a specific flow in code

### 6. Restrictions
State what the assistant must not do.

**Examples:**
- Do not open the browser.
- Do not continue to the next task.
- Do not change unrelated files.
- Do not invent design values outside `DESIGN.md`.
- Do not hardcode secrets.
- Do not guess missing values.

### 7. Missing Information Rule
If the task depends on information the model cannot access, instruct it to stop and ask for that information.

**Rule to include when relevant:**
- If any required value, credential, URL, key, or external setting is missing, stop and ask for it.
- Give short steps explaining how to retrieve it.
- Wait for the owner before continuing.

### 8. Return Format
Define exactly what the model should output after finishing.

**Best practice:**
Keep the return format short and fixed.

**Format example:**
```text
Return only:
- files modified
- whether the task is complete
- whether related documentation was updated
- blockers, if any
```

---

## Recommended Writing Style

When writing prompts for the assistant:
- Use short paragraphs.
- Use numbered requirements when order matters.
- Use bullets for lists of files, rules, or checks.
- Mention exact file names.
- Mention exact routes if the task is page-specific.
- Mention exact data rules if the task affects schema or validation.
- Mention approval checkpoints when the assistant must stop.

---

## Project Anchors

When relevant, prompts should remind the assistant of these project rules:
- `REFERENCE.md` is the functional source of truth.
- `DESIGN.md` is the visual source of truth and must be followed literally.
- `TASKS.md` controls execution order.
- `productName` is required.
- `imageUrl` / product image is optional.
- Supabase is used for database and storage.
- The app is Arabic RTL.
- The assistant must not move to the next task without owner approval.

---

## Reusable Prompt Template

```text
New Task: [Task Name]

Context
[Short explanation of where this task fits in the project]

Task
[State exactly what must be done]

Requirements
1. [Requirement one]
2. [Requirement two]
3. [Requirement three]
4. [Any project-specific rule from REFERENCE.md, DESIGN.md, or TASKS.md]

Required Actions
- [Action one]
- [Action two]
- [Action three]

Restrictions
- Do not [forbidden action]
- Do not [forbidden action]
- Do not [forbidden action]

Missing Information Rule
- If any required information is missing, stop and ask for it.
- Give short steps for how the owner can retrieve it.
- Wait before continuing.

Return only:
- files modified
- whether the task is complete
- whether documentation was updated
- blockers, if any
```

---

## Example Patterns

### Pattern A — Build a New Page
Use this when asking the assistant to create a new page.

```text
New Task: Build [Page Name]

Context
This task belongs to the [project area] and must follow the approved workflow.

Task
Build the [route] page according to REFERENCE.md and DESIGN.md.

Requirements
1. Follow REFERENCE.md for structure and logic.
2. Follow DESIGN.md literally for UI.
3. Keep RTL layout correct.
4. Preserve existing authentication and routing behavior.
5. Do not affect unrelated pages.

Required Actions
- Create or update the page component.
- Add required form fields or display sections.
- Connect the page to the existing API or data flow.
- Update documentation if needed.

Restrictions
- Do not open the browser.
- Do not continue to the next task.
- Do not invent styles outside DESIGN.md.

Return only:
- files modified
- whether the page was completed
- whether documentation was updated
- blockers, if any
```

### Pattern B — Update Existing Logic
Use this when changing validation, schema, calculations, or data flow.

```text
New Task: Update [Logic Name]

Context
The current implementation needs a focused update in one part of the system.

Task
Adjust the existing logic for [specific behavior].

Requirements
1. Keep existing working behavior unchanged unless this task requires otherwise.
2. Update all related layers consistently: schema, validation, UI, and API if needed.
3. Follow REFERENCE.md as the source of truth.
4. If UI is affected, follow DESIGN.md literally.

Required Actions
- Update the relevant code paths.
- Check for dependent files that must stay in sync.
- Update documentation if the behavior changed.

Restrictions
- Do not refactor unrelated code.
- Do not skip validation updates.
- Do not guess business rules.

Return only:
- files modified
- whether the logic change is complete
- whether all related layers were updated
- blockers, if any
```

### Pattern C — Review / Fix Task
Use this when asking the assistant to inspect and fix a known issue.

```text
New Task: Fix [Issue Name]

Context
A specific issue was found and must be corrected without changing unrelated behavior.

Task
Find the cause of the issue and apply a minimal correct fix.

Requirements
1. Fix only the reported issue.
2. Preserve existing correct behavior.
3. Check all related files that may be affected.
4. Update documentation if the fix changes behavior.

Required Actions
- Inspect the related files.
- Apply the fix.
- Verify the logic in code.

Restrictions
- Do not open the browser.
- Do not rewrite unrelated sections.
- Do not change design decisions outside DESIGN.md.

Return only:
- files modified
- whether the issue was fixed
- whether documentation was updated
- blockers, if any
```

---

## Final Guidance

A good prompt for this project should always answer these questions clearly:
1. What exactly is the task?
2. Which files or project rules control it?
3. What must the assistant do?
4. What must the assistant avoid?
5. What should the assistant return?

If a prompt does not answer these five questions, rewrite it before sending it to the model.
