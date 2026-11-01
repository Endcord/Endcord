# GPU Binder

Binds Discord to a GPU preference and applies it again after updates.

Discord updates change the install folder (for example `app-1.0.x`), so Windows treats each version as a new app and forgets the setting. This plugin sets it again for the current version and removes the entries left by old ones.

You can pick:

- High performance (discrete GPU)
- Power saving (integrated GPU)
- Let Windows decide

**This plugin changes the Windows registry** (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`). It overrides any choice made in Windows under System > Display > Graphics. It only works on Windows.
