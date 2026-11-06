# Plugin previews

The picture at the top of a plugin's dialog in Endcord. Endcord reads this folder from the `main` branch on GitHub, so a preview shows up for everyone as soon as it's pushed, without an Endcord update.

## Adding one

1. Capture the plugin at work in a Discord window about 1280 pixels wide. Use a test account: nothing private, no real names, servers or messages.
2. Save it here as `PluginName.webp` (a still) or `PluginName.webm` (a short loop, no sound, under 4 MB). Use the plugin's exact name, as shown in the Plugins tab.
3. List it in `index.json`:

```json
{
    "MessageLogger": { "file": "MessageLogger.webm", "alt": "A deleted message stays in the chat, struck through in red" }
}
```

`alt` describes what the picture shows, for screen readers. File names may only use letters, digits and `. _ + -`, and end in `.webp`, `.png`, `.gif`, `.webm` or `.mp4`. Anything else in `index.json` is ignored.
