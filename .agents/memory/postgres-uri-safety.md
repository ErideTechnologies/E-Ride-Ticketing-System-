---
name: PostgreSQL URI safety in scheduled jobs
description: Securely using a database connection URI with command-line PostgreSQL tools.
---

Use a credential-free process argument list for scheduled PostgreSQL checks. Do not assume that supplying a complete URI through the database-name environment variable has the same behavior as passing it to the client as its explicit connection argument. Map supported URI settings to libpq environment variables, reject unrecognized parameters rather than silently dropping connection security options, and confirm the result with a disposable database.

**Why:** A whole URI in the command line can expose a password to process inspection. A whole URI in the database-name environment variable was observed to be interpreted as a literal database name by the client in this environment, so a check can fail before doing any work.

**How to apply:** When writing background jobs that consume `DATABASE_URL` through `psql`, keep credentials out of argv and reports, explicitly preserve SSL settings, and test both what the child process receives and one real connection.