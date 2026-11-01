# 3. An update must prove itself or be undone

## Context

A broken release that stops Endcord starting also stops it fetching the fix. With automatic updates, one bad build would strand every user at once. The swap itself was also unsafe: a power cut between replacing two of the four files left a mix of two releases.

## Decision

Before replacing files, the updater copies the current version to `previous/` and writes a journal, `update-state.json`.

- A journal still marked `swapping` at startup means the swap was interrupted, so the old files are restored.
- The renderer confirms an update once Endcord is running, which deletes the journal.
- After three Discord page loads without that confirmation, the old files are restored and the page reloads.
- A rejected release is remembered, so the client doesn't install it again. The next release is offered as normal.

## Consequences

- A bad release costs each user three page loads rather than a broken client.
- Page loads are counted rather than process starts. A second instance or starting offline can't trigger a rollback.
- This can't help if `patcher.js` itself fails to load, because this code lives inside it. The installer's loader falls back to plain Discord in that case.
- The confirmation arrives when Endcord starts. A release that breaks later in the session isn't caught.
