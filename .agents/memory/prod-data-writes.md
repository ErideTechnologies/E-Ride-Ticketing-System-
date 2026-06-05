---
name: Production data writes
description: How to mutate/delete production database data on this Replit project
---

# Writing/deleting data in the production database

The production database is **read-only** to agent tooling — `executeSql({environment: "production"})` only runs SELECTs against a read replica. There is **no** agent-side write path to prod.

Dev and prod are **separate databases** (different row counts confirmed in practice), not two views of one DB. Clearing dev does NOT clear prod and vice-versa.

**The only write path to production data is through the deployed app itself.** So any destructive/bulk prod data operation (e.g. "delete all tickets") requires:

1. Add a maintenance endpoint to the app, gated by BOTH an env flag (returns 404 when off) AND the existing admin auth/permission guard — mirror the codebase's other gated test endpoints.
2. Set the env flag for the `production` environment via `setEnvVars` (non-secret flag, allowed).
3. User republishes (prod runs new code + picks up the flag).
4. Trigger it **authenticated as admin** — the agent cannot log in (the admin password is a secret it can't read). Easiest: user pastes a one-line `fetch('/api/...', {method:'POST', credentials:'include'})` in the browser console while logged into the live admin site (session cookie authenticates).
5. Verify via a prod read query, then `deleteEnvVars` the flag (and optionally remove the code).

**Why:** Replit isolates prod for safety; the agent has no prod DB credentials and cannot authenticate to the live app. Forgetting this leads to dead-ends trying to `DELETE` against prod directly.
