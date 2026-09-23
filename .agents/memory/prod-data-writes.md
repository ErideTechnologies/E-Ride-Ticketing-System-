---
name: Production data writes
description: Production database write limitations and the removed bulk ticket purge route
---

# Production database access

The production database is **read-only** to agent tooling — `executeSql({environment: "production"})` only runs SELECTs against a read replica. There is **no** agent-side write path to prod.

Dev and prod are **separate databases** (different row counts confirmed in practice), not two views of one DB. Clearing dev does NOT clear prod and vice-versa.

The bulk ticket purge endpoint and its production flag were intentionally removed. Do not recreate or recommend them as a way to mutate production data.

**Why:** Replit isolates prod for safety; the agent has no prod DB write credentials. The product no longer permits deleting every ticket or resetting ticket numbering.

**How to apply:** Use only existing, authorized application flows for ordinary changes. A request for bulk production deletion requires fresh user direction and a separate safety review, not a workaround for the read-only agent connection.
