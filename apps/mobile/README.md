# X-One Mobile Application

Status: `skeleton`. The Expo shell is preserved and remains completely independent of the backend foundation — it makes no network calls of any kind.

## What is actually checked in

Four tracked files: `package.json`, `App.tsx`, `README.md`, and `AGENTS.md`. `App.tsx` renders one static screen (title, subtitle, one line of copy) with no navigation, no chat UI, no API client, and no mock flows to replace.

`apps/mobile` is deliberately **not** a member of the pnpm workspace — `pnpm-workspace.yaml` lists only `apps/api-gateway`, `apps/web`, and `packages/*`. Install it on its own with npm, and do not expect root `pnpm install` to reach it.

```bash
cd apps/mobile
npm install
npm start
```

Dependencies are pinned to Expo `~51.0.0` / React Native `0.74.1` / React `18.2.0`.

## Known defect

`App.tsx` calls `StyleSheet.StyleSheet.create(...)`, which is undefined — the correct call is `StyleSheet.create(...)`. The shell will throw on render until that is fixed. Left as-is here because this README documents current state; fix it in code, not by editing this note.

## Boundary rules

When flows are eventually built, mobile must call only the public NestJS Gateway at `http://<LOCAL_IP>:3000/api/v1`. It must not call the Agent Service or any domain service directly, and it must not reach a database. Realtime transport is not available and is not planned — see [ADR 0003: synchronous REST](../../docs/adr/0003-synchronous-rest.md).

See [current architecture state](../../docs/architecture/current-state.md) for the deployed surface and [apps/web](../web/) for the client that is actually wired to the Gateway.
