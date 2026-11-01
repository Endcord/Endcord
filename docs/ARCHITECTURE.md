# Architecture

Endcord runs in four places, and each one trusts less than the one before it.

| Part | Code | Runs as |
| --- | --- | --- |
| Main process | `src/main`, every plugin's `native.ts` | Node, with full access to the PC |
| Preload | `src/preload.ts`, `src/EndcordNative.ts` | The bridge between the two |
| Renderer | `src/api`, `src/components`, `src/plugins`, `src/webpack` | Inside Discord's page, under its CSP |
| Browser extension | `browser/` | Inside Discord's page, with no CSP |

See [SECURITY.md](../SECURITY.md) for the threat model, and [docs/adr](adr/README.md) for why things are built this way.

## Rules for the main process

Anything the renderer sends is untrusted. A plugin running in the page, a theme or a message can all reach it.

- **Register IPC with `handleIpc`** (`src/main/utils/ipc.ts`). It refuses any page that isn't Discord. `ipcMain.handle` is a lint error.
- **Run programs with `execFile`, by full path.** `exec` goes through a shell, and Windows looks a bare name up in the working folder first. Both are lint errors.
- **Open links through `isSafeExternalUrl`** (`src/shared/externalLinks.ts`). Web and desktop share this rule.
- **Keep file paths inside their folder** with `ensureSafePath` (`src/main/utils/ensureSafePath.ts`). It also refuses Windows device names like `CON`. Names and extensions from the renderer need their own check.
- **Write settings-like files with `writeFileDurably`** (`src/main/utils/durableFile.ts`). A plain write can leave an empty file after a power cut.

## Fetching in a native

| The URL | Use |
| --- | --- |
| Is always a few known hosts | `parseAllowedUrl(url, hosts)`, then `fetch` |
| Can be anything the user picks | `fetchPublicUrl(url)`, which blocks this PC and the local network |

Read the body with `readBody(response, maxBytes)`. It doesn't trust `Content-Length`.

## Rules for the renderer

- **Don't build HTML from strings.** `innerHTML` and `dangerouslySetInnerHTML` are lint errors. Where one is safe, the disable comment says why.
- **Check links from outside.** `<Link>` drops unsafe hrefs. A plain `<a>` needs `isSafeLink`.
- **Mark secrets.** A plugin setting holding a key, or an address a key is sent to, needs `sensitive: true`. It then stays out of exports and cloud sync.
- **Log with `Logger`** or `console.debug`. `console.log` is a lint error. `Logger` removes tokens and keys, because people paste their console into support channels.

## Patching Discord

Plugins change Discord's code with text patches, so a Discord update can silently break one: the `find` no longer matches, or a `match` regex stops fitting. Discord changes minified names between builds, so match on structure with `\i`, and keep gaps like `.{0,150}` wide enough to survive small changes.

A `find` must hit exactly one module. A patch is used up on the first module that holds its `find`, so if that one is the wrong module the right one is never patched.

Don't return early from a component in a patch. The hooks after that point would stop running and React would throw. Put the check on the component's last `return`.

To check every patch, run the same report as CI: `pnpm buildReporter`, then bundle and run `scripts/generateReport.ts` with `CHROMIUM_BIN` set to a Chromium browser, and `USE_CANARY=true` for Canary. It applies and compiles each patch on a logged out page. Desktop-only plugins aren't in this build.

## Updates

Every update is signed. `version.json` carries an ECDSA P-256 signature, and the client, `install.sh` and `linux/gui.py` each check it against the public key before using anything in it. The payload format is duplicated in `scripts/uploadRelease.mjs`, `src/main/updater/http.ts`, `install.sh` and `linux/gui.py`, so a change has to reach all four.

## Translations

`src/utils/i18n/locales` holds one file per language, and `src/utils/i18n/pluginDescriptions` holds plugin descriptions. English text is the key, so English has no file.

## Tests

`pnpm test` builds, type-checks, lints, and runs:

- `test/security.mjs`: bundles the real main-process code with Electron stubbed out and attacks it. A security fix should come with a case here.
- `test/fuzz.mjs`: throws random hostile input at every validator and checks what each one promises. A failure prints a seed that replays it.
- `test/rules.mjs`: shows each of Endcord's own lint rules a mistake, so a rule can't quietly stop working.
- `scripts/qualityRatchet.mjs`: fails if `as any`, suppressions, oversized files or the bundle size grow.

`pnpm testMutation` runs weekly. It switches each security check off in turn, and `test/security.mjs` has to notice. A survivor means that check could be deleted with every test still green. When you add a check, add it to the list.

The suite makes its own signing key, so it never needs the real one. A few cases read `cdn.discordapp.com`, so it needs internet access.
