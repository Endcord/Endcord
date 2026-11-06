# Security

## Reporting a problem

Please don't open a public issue for a vulnerability. Use [private vulnerability reporting](https://github.com/Endcord/Endcord/security/advisories/new), or message a maintainer on the [Endcord server](https://discord.gg/endcord).

Include what an attacker can do, the steps to reproduce it, and the version you tested.

## Threat model

Endcord runs inside a logged-in Discord client on the user's PC. That makes it a useful target: whoever controls it gets the Discord account and a process with full access to the machine.

### Who we defend against

| Attacker | What they control | Examples |
| --- | --- | --- |
| Another Discord user | Message text, embeds, attachments, profiles | A crafted link or zip sent in a DM |
| A malicious theme or CSS file | Styles, theme metadata, links in its header | A theme whose website link runs script |
| A remote service a plugin talks to | API responses | A review or badge API serving a hostile link |
| A hostile network or DNS server | Traffic and name resolution | Rebinding a name to `127.0.0.1` |
| Someone with a tampered download | The update server or mirror | A swapped update file |

### What we don't defend against

- **Code already running as the user.** Malware on the PC can read anything Endcord can.
- **Plugins the user chose to enable.** They run with Endcord's own access, so a plugin is trusted once it ships.
- **A compromised release key.** It would let an attacker sign updates. Keep it offline and backed up.

### Where the boundaries are

```text
 Discord page (renderer)        untrusted input arrives here
        |
        |  preload: only Discord origins get the native API
        v
 handleIpc: checks the sending frame on every call
        |
        v
 Main process and plugin natives: full access to the PC
```

Each boundary assumes the one before it failed. A page that somehow reaches the preload is still refused by `handleIpc`.

### What protects what

| Threat | Protection | Tested by |
| --- | --- | --- |
| Swapped or tampered update | ECDSA P-256 signed manifest, SHA-256 for each file | `test/security.mjs` |
| A file planted next to the installer | Each payload file has to match the SHA-256 embedded when the installer was built | installer self-test |
| A release that breaks on start | Keeps the previous version and restores it after three failed loads, if the kept copy is still what was saved | `test/security.mjs` |
| Crash or power cut during an update | A journal on disk; a half-finished swap is undone at the next start | `test/security.mjs` |
| Settings lost in a crash | Atomic writes with `fsync`, plus a last-good backup | `test/security.mjs` |
| A page reaching native code | Origin check in the preload and on every IPC call | `test/security.mjs` |
| Requests into this PC or the LAN | Address checks at connect time, so DNS rebinding fails; embedded IPv4 is blocked too | `test/security.mjs` |
| Script in links and hrefs | One shared protocol check for web and desktop | `test/security.mjs`, `test/fuzz.mjs` |
| Files written outside their folder | Path and Windows device name checks | `test/security.mjs`, `test/fuzz.mjs` |
| A planted `powershell.exe` | Programs run by full path, enforced by lint | `scripts/eslint/endcordRules.mjs` |
| Secrets in logs and backups | Log redaction; `sensitive` settings (keys, and the addresses data goes to) stay out of exports and sync | `test/security.mjs`, lint |
| Zip bombs and oversized replies | Limits that don't trust the size a server claims | `test/security.mjs` |
| A hostile dependency update | Locked versions, new releases held back for a week, install scripts allowlisted | `pnpm-workspace.yaml`, CI |

`test/mutation.mjs` switches each check off in turn to prove the tests would notice if it were removed.

## Verifying a release

Every release can be rebuilt from source and compared byte for byte. Check out the release's source, download its `version.json`, then run:

```bash
node scripts/verifyReproducible.mjs --release version.json
```

It rebuilds with the same inputs and compares the result against the signed hashes.

Windows and macOS will warn about the installer, because it isn't code-signed. `installerSha256` in the signed `version.json` is the hash to check it against; the site serves the same value as `EndcordInstaller.exe.sha256`. The installer itself only installs payload files that match the hashes embedded when it was built, so a file dropped next to it under one of their names is refused.
