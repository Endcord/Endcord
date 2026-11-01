# 2. All IPC goes through one gate

## Context

Plugin natives run with full access to the PC, and Endcord's preload is attached to every Discord window. That includes pages that aren't Discord's web app, such as the splash screen. Each new `ipcMain.handle` was one more place to remember a sender check, and none of them had one.

## Decision

Every invoke channel is registered with `handleIpc`, which checks the sending frame's origin before running the handler. The preload makes the same check before exposing anything. `ipcMain.handle` anywhere else is a lint error.

The QuickCSS editor is a `data:` page, so it has no origin to check. It gets an explicit list of two channels instead.

## Consequences

- A new native can't forget the check, because there is nowhere to forget it.
- Pages that aren't Discord get Discord's own preload and nothing from Endcord, so the splash screen no longer loads the renderer.
- A custom `WEBAPP_ENDPOINT` runs Discord without Endcord until its origin is added to `src/shared/trustedOrigins.ts`.
- `ipcMain.on` channels are left out on purpose. They are synchronous, and a page that gets no reply hangs forever. Only `GET_SETTINGS` returns private data, and it checks the sender itself.
