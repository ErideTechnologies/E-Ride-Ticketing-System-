---
name: GitHub publishing fallback
description: Handling a failed HTTPS push when the connected GitHub API can still publish the same content
---

If a normal Git push fails with invalid cached credentials, the connected GitHub integration may still have repository write access through its authenticated API proxy. A Git Data API commit recreated from identical blobs and tree can receive a different commit ID than the local commit. Check remote ancestry before updating it and verify blob and tree hashes; if the resulting remote tree matches the local tree, align the local branch to the remote commit only after confirming the working tree is clean and fetching the remote branch.

**Why:** This workspace's HTTPS push rejected credentials while the connected GitHub integration successfully published the equivalent file tree. The first large blob transfer through the sandbox was silently head/tail-truncated, so checksum verification prevented publishing corrupt content; smaller chunks worked.

**How to apply:** Prefer ordinary Git push first. For an integration fallback, never force-update a moved remote branch or trust a large encoded shell result without independently checking its expected size and Git hash.