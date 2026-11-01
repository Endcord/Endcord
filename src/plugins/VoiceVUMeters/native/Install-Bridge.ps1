param([switch]$AuditOnly, [string]$TapSha256)
$ErrorActionPreference = 'Stop'
$payload = Join-Path $env:LOCALAPPDATA 'DiscordStereoLoader/payload'
$voice = Join-Path $payload 'discord_voice.node'
$index = Join-Path $payload 'index.js'
$audited = '4039dcd110a2d2b17672a62f94d11dd5a9a4e59ab2420915ef1362a29467a4a5'
if (-not (Test-Path -LiteralPath $voice) -or (Get-FileHash -LiteralPath $voice).Hash.ToLowerInvariant() -ne $audited) {
    throw 'This native voice build has not been audited. No files were changed.'
}
$content = [IO.File]::ReadAllText($index)
$marker = 'module.exports = VoiceEngine;'
if (-not $content.Contains($marker)) { throw 'Unsupported voice wrapper. No files were changed.' }
if ($AuditOnly) { Write-Output 'Audited native voice binary and wrapper found. No files were changed.'; return }
# This addon is compiled locally, so its hash can't be pinned here: whoever built it has to vouch for the file being copied into Discord
$tap = Join-Path $PSScriptRoot 'participant_tap.node'
if (-not $TapSha256) { throw "Pass -TapSha256 with the hash of the participant_tap.node you built. No files were changed." }
if ((Get-FileHash -LiteralPath $tap).Hash -ne $TapSha256) { throw 'participant_tap.node does not match -TapSha256. No files were changed.' }
$backup =Join-Path $payload ('meter-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $index -Destination (Join-Path $backup 'index.js')
foreach ($file in 'participant_bridge.cjs','participant_tap.node') {
    $destination = Join-Path $payload $file
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination $backup }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination
    if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $file)).Hash) { throw "Copy verification failed for $file" }
}
if (-not $content.Contains('[VoiceVUMeters/native] participant PCM bridge ready')) {
    $injection = @'
// VoiceVUMeters participant PCM bridge. The addon rejects unaudited native binaries.
try {
  const participantPath = require('path').join(require('os').homedir(), 'AppData', 'Local', 'DiscordStereoLoader', 'payload');
  require(require('path').join(participantPath, 'participant_bridge.cjs'))(VoiceEngine, require(require('path').join(participantPath, 'participant_tap.node')));
  console.log('[VoiceVUMeters/native] participant PCM bridge ready');
} catch (error) {
  console.warn('[VoiceVUMeters/native] participant PCM bridge unavailable: ' + error.message);
}

'@
    [IO.File]::WriteAllText($index, $content.Replace($marker, $injection + $marker), [Text.UTF8Encoding]::new($false))
}
Write-Output "Bridge installed. Backup: $backup. Restart Discord after your call to activate it."
