# 1. Updates are signed by a key the repository doesn't hold

## Context

Every client downloads and runs whatever `version.json` points at. Checksums alone prove nothing, because they arrive through the same channel as the files. Anyone who could change that file, through a stolen GitHub token or a hacked site, could run code on every user's PC.

## Decision

`scripts/uploadRelease.mjs` signs the manifest with an ECDSA P-256 key kept outside the repository. Clients hold only the public key, and refuse a manifest that fails to verify. The manifest covers each file's SHA-256, so the signature reaches every byte.

## Consequences

- A stolen GitHub or site account can't ship an update.
- Losing the key ends updates: a new key needs a new installer. It has to be backed up offline.
- The signed payload is built in four places (`scripts/uploadRelease.mjs`, `src/main/updater/http.ts`, `install.sh`, `linux/gui.py`), so a format change has to reach all four.
