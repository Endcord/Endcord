# Architecture decisions

Each record explains one decision that isn't obvious from the code: what forced it, and what it costs. Read one before undoing what it describes.

1. [Updates are signed by a key the repository doesn't hold](0001-signed-updates.md)
2. [All IPC goes through one gate](0002-single-ipc-gate.md)
3. [An update must prove itself or be undone](0003-update-rollback.md)
4. [Core code doesn't depend on plugins](0004-layers.md)
5. [A status shown to people comes from a check that ran](0005-status-comes-from-a-check.md)
6. [Endcord's own screens wear Endcord's colors](0006-endcord-screens-wear-endcord-colors.md)
