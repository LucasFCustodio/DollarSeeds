---
description: Remove a feature's frontend while keeping its backend, then log it in REMOVED_FEATURES.md
argument-hint: <feature name> (e.g. "Budget Health")
---

You are parking a feature following the exact policy in @REMOVED_FEATURES.md.

**Feature to remove:** $ARGUMENTS

Read [REMOVED_FEATURES.md](REMOVED_FEATURES.md) first and follow its governing rule:
**remove only the frontend; keep ALL backend logic intact** so the feature can be
restored later as a frontend-only change.

Do this:

1. **Locate the feature.** Search the codebase for everything tied to "$ARGUMENTS":
   - Frontend: screens, buttons, components, derived values, styles, icon imports,
     and any navigation/route entry points that reach it.
   - Backend: the endpoint(s) and helper functions that power it.

2. **Before removing anything, check whether each backend endpoint/helper is used by
   OTHER features.** If it is, note that — it must stay regardless. Never delete or
   weaken backend logic.

3. **Remove the frontend only:**
   - Delete the UI elements, derived values, and styles for the feature.
   - Remove now-unused imports it leaves behind.
   - Delete dedicated screen files (they're recoverable from git history); for shared
     files, surgically remove just the feature's parts.
   - If removing UI leaves a backend response field unused, you may keep the field in
     frontend types/defaults so the API shape stays documented — mention this choice.

4. **Verify nothing dangles:** grep the touched files for the removed identifiers,
   routes, and styles to confirm no broken references remain. Report what you checked.

5. **Append a new numbered entry to REMOVED_FEATURES.md** matching the existing format,
   with sections: what it was, why removed, **Frontend removed** (file-linked list),
   **Backend KEPT (do not remove)** (with note if shared/still-used elsewhere), and
   **To bring back**.

If "$ARGUMENTS" is ambiguous or you find multiple candidates, ask which one before
deleting anything. Do not run git commits or push unless asked. Note that you cannot
run the Expo build here, so state that the change is verified by code review, not a
live render.
