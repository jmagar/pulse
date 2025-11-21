# Webhook Docker CLI & Dashboard Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move external service monitoring out of `pulse_web` and into the webhook server, giving the webhook access to Docker CLI so it can surface resource usage (CPU/memory/volumes) for both local and remote contexts.

**Architecture:** Install Docker CLI in the webhook container, mount the host socket (as needed), and add a FastAPI endpoint that runs `docker --context` commands to gather stats. `pulse_web` will consume this new endpoint instead of spawning docker CLI processes.

**Tech Stack:** Python 3 / FastAPI, Docker CLI, TypeScript/Next.js.

## Task 1: Install Docker CLI in webhook container

**Files:**
- Modify: `apps/webhook/Dockerfile`

1. Add apt commands to install Docker CLI:
   ```dockerfile
   RUN apt-get update \
    && apt-get install -y curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
   ```
2. Rebuild: `docker compose build pulse_webhook`.

## Task 2: Add webhook API to report external stats

**Files:**
- Create: `apps/webhook/api/routes/external_stats.py`
- Modify: `apps/webhook/api/routes/__init__.py`
- Modify: `apps/webhook/main.py`
- Modify: `apps/webhook/core/config.py`
- Create tests: `apps/webhook/tests/api/test_external_stats.py`

1. Config: define `EXTERNAL_SERVICES` array with names, contexts, health paths, volume mounts.
2. Helper: run `docker --context <ctx> inspect <name>` and `docker --context <ctx> stats --no-stream --format '{{json .}}' <name>`, parse CPU/memory/uptime.
3. Volume usage: reuse existing `du -sb` helper for configured mounts.
4. API route `GET /api/external/services` returning JSON array with per-service stats + timestamp.
5. Tests: mock subprocess to return sample JSON for inspect/stats and assert API output.
6. Run `pnpm --filter webhook test`.

## Task 3: Remove external docker logic from pulse_web backend

**Files:**
- Modify: `apps/web/app/api/dashboard/services/route.ts`

1. Strip helper functions for external docker context (`getContextServiceData`, `execDocker`, etc.) and remove related env vars.
2. Fetch webhook data via `await fetch(process.env.NEXT_PUBLIC_WEBHOOK_URL + '/api/external/services')` and merge results with existing service list.
3. Ensure stack totals include the merged services.
4. Update types if necessary (volume bytes, stack totals).

## Task 4: Clean env/config

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: any config files referencing `DASHBOARD_EXTERNAL_CONTEXT/DASHBOARD_DOCKER_BIN`

1. Remove obsolete dashboard env vars (`DASHBOARD_EXTERNAL_CONTEXT`, `DASHBOARD_DOCKER_BIN`).
2. Add webhook-specific env vars (`WEBHOOK_EXTERNAL_CONTEXT`, `WEBHOOK_DOCKER_BIN`).
3. Document the new env vars in README/CLAUDE as needed.

## Task 5: Verify end-to-end

1. Rebuild webhook + web: `docker compose up -d --build pulse_webhook pulse_web`.
2. Hit `http://localhost:50108/api/external/services` to verify stats JSON.
3. Hard refresh dashboard; confirm external services now show CPU/memory/volumes.
4. Run lint/tests across repo: `pnpm lint`, `pnpm test` as needed.

Plan complete and saved to `docs/plans/2025-11-17-webhook-docker-cli-plan.md`. Two execution options:
1. **Subagent-Driven (this session)** – I dispatch fresh subagent per task, reviewing between tasks.
2. **Parallel Session** – Start a new session (with `executing-plans`) dedicated to implementation.

Which approach?
