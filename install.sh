#!/bin/sh
# Endcord installer for macOS and Linux.
#
#   sh -c "$(curl -fsSL https://endcord.com/install.sh)"
#
# Options (all optional; without them you get a menu):
#   --install | --repair | --uninstall   choose the action
#   --all                                 use every Discord install found, no prompt
#   --local DIR                           install the Endcord files in DIR instead of downloading them
#
# Endcord's files go to ~/Library/Application Support/Endcord/dist (macOS) or ~/.config/Endcord/dist (Linux).
# Each Discord install gets a small loader in its resources folder; Discord's own app.asar is kept as _app.asar.

set -eu

VERSION_URL="${ENDCORD_VERSION_URL:-https://raw.githubusercontent.com/rootpoii/Endcord/main/version.json}"
SITE_VERSION_URL="${ENDCORD_SITE_VERSION_URL:-https://endcord.com/version.json}"
FILES="patcher.js preload.js renderer.js renderer.css"
# Discord's real app.asar is several MB; anything smaller is another mod's loader stub
ORIGINAL_ASAR_MIN_SIZE=100000

ACTION=""
PICK=""
LOCAL_DIR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --install) ACTION=install ;;
        --repair) ACTION=repair ;;
        --uninstall) ACTION=uninstall ;;
        --all) PICK=all ;;
        --local) shift; LOCAL_DIR="${1:-}" ;;
        -h|--help) sed -n '2,13p' "$0" 2>/dev/null || true; exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Reads an answer from the terminal even when the script itself came through a pipe.
# Without a usable terminal (CI, cron) /dev/tty can exist but not open; the default answer is used then.
ask() {
    REPLY=""
    if { printf '%s' "$1" > /dev/tty; } 2>/dev/null; then
        read -r REPLY < /dev/tty 2>/dev/null || REPLY=""
    fi
}

OS=$(uname -s)
case "$OS" in
    Darwin) ENDCORD_DIR="$HOME/Library/Application Support/Endcord" ;;
    Linux) ENDCORD_DIR="$HOME/.config/Endcord" ;;
    *) fail "Endcord's installer supports macOS and Linux. On Windows, use EndcordInstaller.exe from https://endcord.com/download" ;;
esac
DIST_DIR="$ENDCORD_DIR/dist"

if [ "$(id -u)" -eq 0 ]; then
    fail "Run this as your normal user, not root. It asks for your password only if a Discord install needs it."
fi
if [ "$OS" = Linux ] && grep -qs CHROMEOS_RELEASE_NAME /etc/lsb-release; then
    fail "ChromeOS is not supported."
fi

TMP=$(mktemp -d 2>/dev/null || mktemp -d -t endcord)
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

# ---- Finding Discord ------------------------------------------------------------------------------

CLIENTS="$TMP/clients"
: > "$CLIENTS"

# $1 = label, $2 = resources folder of that Discord install
add_client() {
    [ -d "$2" ] || return 0
    [ -f "$2/app.asar" ] || [ -f "$2/_app.asar" ] || [ -f "$2/app/index.js" ] || return 0
    grep -qxF "$1|$2" "$CLIENTS" && return 0
    printf '%s|%s\n' "$1" "$2" >> "$CLIENTS"
}

if [ "$OS" = Darwin ]; then
    for base in /Applications "$HOME/Applications"; do
        for name in "Discord" "Discord PTB" "Discord Canary" "Discord Development"; do
            add_client "$name" "$base/$name.app/Contents/Resources"
        done
    done
else
    for root in /opt/discord /opt/Discord /usr/share/discord /usr/share/Discord /usr/lib/discord /usr/lib64/discord "$HOME/.local/share/discord"; do
        add_client "Discord" "$root/resources"
    done
    for root in /opt/discord-ptb /usr/share/discord-ptb "$HOME/.local/share/discord-ptb"; do
        add_client "Discord PTB" "$root/resources"
    done
    for root in /opt/discord-canary /usr/share/discord-canary "$HOME/.local/share/discord-canary"; do
        add_client "Discord Canary" "$root/resources"
    done
    add_client "Discord Development" /opt/discord-development/resources
    for flat in /var/lib/flatpak "$HOME/.local/share/flatpak"; do
        add_client "Discord (Flatpak)" "$flat/app/com.discordapp.Discord/current/active/files/discord/resources"
        add_client "Discord Canary (Flatpak)" "$flat/app/com.discordapp.DiscordCanary/current/active/files/discord-canary/resources"
    done
    [ -d /snap/discord ] && say "Snap Discord can't be modded (its files are read-only). Use the .deb, .tar.gz or Flatpak version."
fi

if [ ! -s "$CLIENTS" ]; then
    if [ "$OS" = Darwin ]; then
        fail "No Discord found in /Applications. Install it from https://discord.com/download and open it once."
    fi
    fail "No Discord install found. Install the .deb, .tar.gz or Flatpak version from https://discord.com/download"
fi

# ---- Choosing what to do --------------------------------------------------------------------------

if [ -z "$ACTION" ]; then
    say "Endcord installer"
    say "  1) Install Endcord"
    say "  2) Repair Endcord"
    say "  3) Uninstall Endcord"
    say "  4) Quit"
    ask "Choice [1]: "
    case "$REPLY" in
        2) ACTION=repair ;;
        3) ACTION=uninstall ;;
        4|q|Q) exit 0 ;;
        *) ACTION=install ;;
    esac
fi

if [ -z "$PICK" ] && [ "$(wc -l < "$CLIENTS" | tr -d ' ')" -gt 1 ]; then
    say ""
    say "Discord installs found:"
    i=0
    while IFS='|' read -r label res; do
        i=$((i + 1))
        say "  $i) $label  ($res)"
    done < "$CLIENTS"
    ask "Which one? Number, or Enter for all: "
    PICK="$REPLY"
fi
case "$PICK" in
    ""|all|a|A) PICK=all ;;
    *[!0-9]*) fail "Unknown choice: $PICK" ;;
esac
if [ "$PICK" != all ] && ! sed -n "${PICK}p" "$CLIENTS" | grep -q .; then
    fail "There is no Discord install number $PICK"
fi

# ---- Getting Endcord's files ----------------------------------------------------------------------

download() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 2 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$1" -O "$2"
    else
        fail "curl or wget is needed to download Endcord"
    fi
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        openssl dgst -sha256 "$1" | sed 's/.*= //'
    fi
}

# Prints "name url sha256" for each asset in version.json (the release script writes one key per line)
read_assets() {
    awk '
        /"assets"/ { inside = 1 }
        !inside { next }
        /"name"/ { name = $0; sub(/.*"name"[ \t]*:[ \t]*"/, "", name); sub(/".*/, "", name) }
        /"url"/ { url = $0; sub(/.*"url"[ \t]*:[ \t]*"/, "", url); sub(/".*/, "", url) }
        /"sha256"/ { sum = $0; sub(/.*"sha256"[ \t]*:[ \t]*"/, "", sum); sub(/".*/, "", sum) }
        /}/ && name != "" { print name, url, sum; name = ""; url = ""; sum = "" }
    ' "$1"
}

# True when $1 lists all four files, each with a SHA-256 (writes them to $TMP/assets)
has_checksums() {
    read_assets "$1" > "$TMP/assets" || return 1
    for f in $FILES; do
        grep -Eq "^$f [^ ]+ [0-9a-fA-F]{64}\$" "$TMP/assets" || return 1
    done
}

checksum_of() {
    grep "^$1 " "$TMP/assets" | cut -d' ' -f3 | tr 'A-F' 'a-f'
}

fetch_files() {
    say "Downloading Endcord..."
    if download "$VERSION_URL?t=$(date +%s)" "$TMP/version.json" && has_checksums "$TMP/version.json"; then
        for f in $FILES; do
            url=$(grep "^$f " "$TMP/assets" | cut -d' ' -f2)
            download "$url" "$TMP/$f" || fail "Could not download $f"
        done
    else
        # No verifiable release on GitHub yet: use the site's copy, which ships the same files in one archive
        download "$SITE_VERSION_URL?t=$(date +%s)" "$TMP/version.json" || fail "Could not reach endcord.com or GitHub. Check your connection and try again."
        has_checksums "$TMP/version.json" || fail "The current release has no checksums, so it can't be verified. Try again later."
        bundle=$(sed -n 's/.*"bundle"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TMP/version.json" | head -n 1)
        [ -n "$bundle" ] || fail "The current release has no download for macOS and Linux. Try again later."
        download "$bundle" "$TMP/bundle.tar.gz" || fail "Could not download Endcord"
        mkdir -p "$TMP/bundle"
        tar -xzf "$TMP/bundle.tar.gz" -C "$TMP/bundle" || fail "The download was damaged; nothing was installed."
        for f in $FILES; do
            [ -f "$TMP/bundle/$f" ] || fail "The download is missing $f; nothing was installed."
            cp "$TMP/bundle/$f" "$TMP/$f"
        done
    fi
    for f in $FILES; do
        [ "$(sha256_of "$TMP/$f")" = "$(checksum_of "$f")" ] || fail "$f doesn't match its checksum; nothing was installed."
    done
}

copy_local_files() {
    [ -d "$LOCAL_DIR" ] || fail "$LOCAL_DIR is not a folder"
    for f in $FILES; do
        [ -s "$LOCAL_DIR/$f" ] || fail "$LOCAL_DIR has no $f"
        cp "$LOCAL_DIR/$f" "$TMP/$f"
    done
}

install_files() {
    if [ -n "$LOCAL_DIR" ]; then copy_local_files; else fetch_files; fi
    mkdir -p "$DIST_DIR"
    # Everything is downloaded and checked before the installed copy is touched
    for f in $FILES; do
        cp "$TMP/$f" "$DIST_DIR/$f.new"
    done
    for f in $FILES; do
        mv -f "$DIST_DIR/$f.new" "$DIST_DIR/$f"
    done
    say "Endcord files are in $DIST_DIR"
}

# ---- Patching Discord -----------------------------------------------------------------------------

# Same loader the Windows installer writes; it falls back to plain Discord if Endcord can't load
mkdir -p "$TMP/loader"
printf '%s\n' '{' '  "name": "discord",' '  "main": "index.js"' '}' > "$TMP/loader/package.json"
cat > "$TMP/loader/index.js" <<'EOF'
// Endcord Loader
const { join } = require('path');
const appData = process.env.ENDCORD_INSTALLER_ROAMING || process.env.APPDATA || (process.platform === 'darwin' ? join(process.env.HOME, 'Library/Application Support') : join(process.env.HOME, '.config'));
const patcherPath = join(appData, 'Endcord', 'dist', 'patcher.js');
try {
    require(patcherPath);
} catch (e) {
    console.error('[Endcord] Failed to load patcher.js, falling back to vanilla _app.asar:', e);
    require(join(__dirname, '..', '_app.asar'));
}
EOF

# Runs as root only when the resources folder isn't writable (system-wide Linux installs)
as_owner() {
    res="$1"
    shift
    if [ -w "$res" ]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    elif command -v doas >/dev/null 2>&1; then
        doas "$@"
    else
        fail "$res needs admin rights, but neither sudo nor doas is installed."
    fi
}

# $1 = resources folder, $2 = loader folder
PATCH_SCRIPT='
set -e
res="$1"; loader="$2"; min="$3"
asar="$res/app.asar"; backup="$res/_app.asar"
[ -d "$asar" ] && rm -rf "$asar"
if [ -f "$asar" ]; then
    if [ "$(wc -c < "$asar" | tr -d " ")" -ge "$min" ]; then
        mv -f "$asar" "$backup"
    else
        rm -f "$asar"
    fi
fi
[ -f "$backup" ] || { echo "Discord'"'"'s app.asar is missing in $res; reinstall Discord and try again." >&2; exit 3; }
rm -rf "$res/app"
mkdir "$res/app"
cp "$loader/index.js" "$loader/package.json" "$res/app/"
'

# $1 = resources folder, $2 = original-asar size threshold
RESTORE_SCRIPT='
set -e
res="$1"; min="$2"
asar="$res/app.asar"; backup="$res/_app.asar"
rm -rf "$res/app"
[ -d "$asar" ] && rm -rf "$asar"
if [ -f "$backup" ]; then
    if [ -f "$asar" ] && [ "$(wc -c < "$asar" | tr -d " ")" -ge "$min" ]; then
        rm -f "$backup"
    else
        rm -f "$asar"
        mv -f "$backup" "$asar"
    fi
fi
'

close_discord() {
    if [ "$OS" = Darwin ]; then
        for name in "Discord" "Discord PTB" "Discord Canary" "Discord Development"; do
            pgrep -xq "$name" || continue
            osascript -e "tell application \"$name\" to quit" >/dev/null 2>&1 || true
        done
        sleep 2
        for name in "Discord" "Discord PTB" "Discord Canary" "Discord Development"; do
            pkill -x "$name" 2>/dev/null || true
        done
    else
        for name in Discord DiscordPTB DiscordCanary DiscordDevelopment discord discord-ptb discord-canary; do
            pkill -x "$name" 2>/dev/null || true
        done
    fi
    sleep 1
}

# macOS only lets Terminal change other apps once it has App Management access
explain_mac_permission() {
    say ""
    say "macOS blocked the change. Give your terminal permission to update apps:"
    say "  System Settings > Privacy & Security > App Management > turn on Terminal (or the terminal app you use)"
    say "Then quit and reopen the terminal and run this installer again."
}

flatpak_access() {
    case "$1" in
        *com.discordapp.DiscordCanary*) id=com.discordapp.DiscordCanary ;;
        *com.discordapp.Discord*) id=com.discordapp.Discord ;;
        *) return 0 ;;
    esac
    command -v flatpak >/dev/null 2>&1 || return 0
    # Read access to load Endcord, write access so Endcord can update itself
    if flatpak override --user --filesystem="$ENDCORD_DIR" "$id"; then
        say "  Gave the Flatpak access to $ENDCORD_DIR"
    else
        say "  Couldn't give the Flatpak access. Run: flatpak override --user --filesystem=$ENDCORD_DIR $id"
    fi
}

# On macOS a folder can look writable and still be blocked by App Management, so try a real write first
can_modify() {
    [ "$OS" = Darwin ] || return 0
    if as_owner "$1" touch "$1/.endcord-write-test" 2>/dev/null; then
        as_owner "$1" rm -f "$1/.endcord-write-test"
        return 0
    fi
    explain_mac_permission
    return 1
}

patch_client() {
    can_modify "$2" || return 1
    as_owner "$2" sh -c "$PATCH_SCRIPT" sh "$2" "$TMP/loader" "$ORIGINAL_ASAR_MIN_SIZE" || return 1
    say "  Patched $1"
    [ "$OS" = Linux ] && flatpak_access "$2"
    return 0
}

restore_client() {
    can_modify "$2" || return 1
    as_owner "$2" sh -c "$RESTORE_SCRIPT" sh "$2" "$ORIGINAL_ASAR_MIN_SIZE" || return 1
    say "  Restored $1"
}

# ---- Doing it -------------------------------------------------------------------------------------

if [ "$ACTION" != uninstall ]; then
    install_files
fi

close_discord

failed=0
i=0
while IFS='|' read -r label res; do
    i=$((i + 1))
    [ "$PICK" = all ] || [ "$PICK" = "$i" ] || continue
    say "$label:"
    if [ "$ACTION" = uninstall ]; then
        restore_client "$label" "$res" < /dev/null || failed=1
    else
        patch_client "$label" "$res" < /dev/null || failed=1
    fi
done < "$CLIENTS"

say ""
if [ "$ACTION" = uninstall ]; then
    still_used=0
    while IFS='|' read -r label res; do
        grep -qs "Endcord Loader" "$res/app/index.js" && still_used=1
    done < "$CLIENTS"
    if [ "$still_used" = 0 ]; then
        rm -rf "$DIST_DIR"
        say "Endcord is uninstalled. Your Endcord settings are still in $ENDCORD_DIR in case you come back."
    else
        say "Removed Endcord from the selected Discord. Other Discord installs still use it, so its files stay in $DIST_DIR"
    fi
elif [ "$failed" = 0 ]; then
    say "Done! Open Discord and Endcord loads with it."
    [ "$OS" = Darwin ] && say "When Discord updates itself on macOS, run this installer again and choose Repair."
fi
exit "$failed"
