# 4. Core code doesn't depend on plugins

## Context

Endcord ships about 500 plugins, and users can turn any of them off. When core code imports a plugin, that plugin stops being optional. The header bar depended on `HideEndcord` this way, and the themes tab on `ClientTheme`.

## Decision

The source is split into layers, and `endcord/layer-boundaries` enforces them:

| Layer | Can't import | Because |
| --- | --- | --- |
| `src/shared` | main, API, components, plugins, webpack, electron | It runs in both processes |
| `src/main` | API, components, plugins, webpack | There is no page to run them in |
| `src/api`, `src/components`, `src/webpack`, `src/utils` | plugins, main, electron | Core must work with any plugin removed, and runs without Node |

Type-only imports are allowed, because they don't exist at runtime. `_api` and `_core` count as core: they are required plugins and can't be turned off.

## Consequences

- State that core and a plugin share moves down into core, as `src/api/EndcordVisibility.ts` did.
- Core refers to optional plugins by name through the plugin manager.
