# 6. Endcord's own screens wear Endcord's colors

## Context

Endcord's screens sit inside Discord, next to Discord's own components. Following Discord's colors would make them fit in, but then nothing would say they're Endcord, and the installer, the site and the app would look like three products.

Discord's dropdowns, switches and inputs can't simply be restyled one by one. There are too many of them, and their class names change with Discord's builds.

## Decision

- Every screen Endcord draws uses the installer's palette from `src/endcordUi.css`: night blue, cobalt and ice. That holds on Discord's light theme and under a look from Theme Studio or a community theme.
- A screen gets the theme from `ENDCORD_THEME` in `@utils/css`. It's two classes: `theme-dark` makes Discord work out its colors again on that element, and `ec-theme` hands it scales moved onto the palette, so Discord's components inside follow without any styling of their own.
- `src/endcordTheme.css` holds those scales. Discord turns each step into a finished color once, on the root, so both the steps and the finished colors are declared.
- Discord's `Modal` takes no class, so dialogs use `EndcordModal`, which puts the theme on the dialog it renders.

## Consequences

- The theme stops at anything Discord renders in a portal, such as an open dropdown list, a tooltip or a confirmation dialog. Those keep Discord's colors.
- The scale steps in `endcordTheme.css` are a copy of Discord's at the time. If Discord adds steps, the new ones show Discord's color until the file is updated.
