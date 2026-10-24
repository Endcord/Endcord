# Publishing Endcord Web for Firefox

Firefox only installs extensions that Mozilla has signed. Signing is free and needs a Mozilla account.

1. Run `node-v22\node.exe scripts/uploadRelease.mjs --dry-run` (or a real release). It leaves two files in `dist/`:
   - `extension-firefox.zip`: the extension itself
   - `EndcordSource.zip`: the source code Mozilla asks for, because the extension's code is bundled and minified
2. Sign in at https://addons.mozilla.org/developers/ and choose **Submit a New Add-on**.
3. Pick **On this site** to be listed on addons.mozilla.org, or **On your own** to get a signed `.xpi` to host on endcord.com.
4. Upload `extension-firefox.zip`. When asked whether the code is minified, say yes and upload `EndcordSource.zip`.
5. Paste these build steps into the reviewer notes:

   ```
   Requires Node.js 22 and pnpm.
   pnpm install --frozen-lockfile
   pnpm buildWeb
   The extension is written to dist/firefox-unpacked (zipped as dist/extension-firefox.zip).
   ```

The add-on id is `endcord-web@endcord.com` (in `browser/manifestv2.json`); keep it the same for every update.
After Mozilla signs it, add the Firefox link to the Browser tab of the download page.
