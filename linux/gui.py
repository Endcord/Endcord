#!/usr/bin/env python3
# The Linux installer GUI, laid out and colored like the Windows one (installer/InstallerGUI.cs)
from __future__ import print_function

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen, Request

HOME = os.path.expanduser("~")
# The loader reads $HOME/.config whatever XDG_CONFIG_HOME says
CONFIG = os.path.join(HOME, ".config")
DIST_DIR = os.path.join(CONFIG, "Endcord", "dist")
FILES = ("patcher.js", "preload.js", "renderer.js", "renderer.css")
# Where the files are, and the manifest with their checksums. endcord.com has them in one archive
MIRRORS = (
    ("https://raw.githubusercontent.com/Endcord/Endcord/main/dist", "https://raw.githubusercontent.com/Endcord/Endcord/main/version.json"),
    ("https://endcord.com/EndcordFiles.tar.gz", "https://endcord.com/version.json"),
)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HERE = Path(SCRIPT_DIR)
QUIT = threading.Event()
# Any web page can reach the local API, so requests have to prove they come from the installer's window
TOKEN = secrets.token_urlsafe(32)
# The window's address shows in the process list, so it carries a code that opens the page once, never the token itself.
# The page then keeps a cookie, which is what a reload shows
PAGE_CODE = secrets.token_urlsafe(32)
PAGE_COOKIE = secrets.token_urlsafe(32)
PAGE_LOCK = threading.Lock()
PAGE_OPENED = False
UPDATE_KEY = """-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJi37GlwG/uPNC4oQicUcI1bPlnri
1pXQGzUzDQwBnxQ1+F7tFtUkOjancC1eScKb9H9eASOz7iUA3CiGgXtHaw==
-----END PUBLIC KEY-----
"""

CANDIDATES = [
    ("Discord Stable", "/opt/discord", "Discord"),
    ("Discord Stable", "/opt/Discord", "Discord"),
    ("Discord Stable", "/usr/share/discord", "discord"),
    ("Discord Stable", "/usr/share/Discord", "Discord"),
    ("Discord Stable", "/usr/lib64/discord", "discord"),
    ("Discord Stable", "/usr/lib/discord", "discord"),
    ("Discord Stable", os.path.join(HOME, ".local/share/discord"), "Discord"),
    ("Discord Canary", "/opt/discord-canary", "DiscordCanary"),
    ("Discord Canary", "/usr/share/discord-canary", "discord-canary"),
    ("Discord Canary", os.path.join(HOME, ".local/share/discord-canary"), "DiscordCanary"),
    ("Discord PTB", "/opt/discord-ptb", "DiscordPTB"),
    ("Discord PTB", "/usr/share/discord-ptb", "discord-ptb"),
    ("Discord PTB", os.path.join(HOME, ".local/share/discord-ptb"), "DiscordPTB"),
    ("Discord Dev", "/opt/discord-development", "DiscordDevelopment"),
    ("Discord Dev", "/usr/share/discord-development", "discord-development"),
    ("Discord Stable (Flatpak)", "/var/lib/flatpak/app/com.discordapp.Discord/current/active/files/discord", "Discord"),
    ("Discord Stable (Flatpak)", os.path.join(HOME, ".local/share/flatpak/app/com.discordapp.Discord/current/active/files/discord"), "Discord"),
    ("Discord Canary (Flatpak)", "/var/lib/flatpak/app/com.discordapp.DiscordCanary/current/active/files/discord-canary", "DiscordCanary"),
    ("Discord Canary (Flatpak)", os.path.join(HOME, ".local/share/flatpak/app/com.discordapp.DiscordCanary/current/active/files/discord-canary"), "DiscordCanary"),
]


def _is_discord_res(res):
    return (
        os.path.isfile(os.path.join(res, "app.asar"))
        or os.path.isfile(os.path.join(res, "_app.asar"))
        or os.path.isfile(os.path.join(res, "app", "index.js"))
    )


def resource_dirs(root):
    root = os.path.abspath(root)
    found = []
    try:
        for name in sorted(os.listdir(root)):
            if name.startswith("app-"):
                res = os.path.join(root, name, "resources")
                if os.path.isdir(res) and _is_discord_res(res):
                    found.append(res)
    except OSError:
        pass
    res = os.path.join(root, "resources")
    if not found and os.path.isdir(res) and _is_discord_res(res):
        found.append(res)
    return found


def read_version(root, res):
    for p in (
        os.path.join(root, "resources", "build_info.json"),
        os.path.join(res, "build_info.json"),
    ):
        try:
            data = json.loads(Path(p).read_text(encoding="utf-8"))
            v = data.get("version") or data.get("versionHash")
            if v:
                return str(v)
        except Exception:
            pass
    parent = os.path.basename(os.path.dirname(res))
    return parent if parent.startswith("app-") else "resources"


def has_endcord(res):
    idx = os.path.join(res, "app", "index.js")
    try:
        return os.path.isfile(idx) and "Endcord" in Path(idx).read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False


def is_running(proc):
    try:
        r = subprocess.run(["pgrep", "-x", proc], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return r.returncode == 0
    except OSError:
        return False


def snap_warning():
    return os.path.isdir("/snap/discord")


def scan_clients(extra_roots=None):
    seen = set()
    out = []
    rows = list(CANDIDATES)
    for root in extra_roots or []:
        rows.append(("Custom Path", root, "Discord"))
    for name, root, proc in rows:
        if not root or not os.path.isdir(root):
            continue
        key = os.path.realpath(root)
        if key in seen:
            continue
        ress = resource_dirs(root)
        if not ress:
            continue
        seen.add(key)
        res = ress[-1]
        out.append({
            "name": name,
            "root": root,
            "resources": res,
            "proc": proc,
            "version": read_version(root, res),
            "running": is_running(proc),
            "injected": any(has_endcord(r) for r in ress),
            "writable": os.access(os.path.dirname(res), os.W_OK),
        })
    return out


def find_local_dist():
    for p in (
        HERE / "dist",
        HERE.parent / "dist",
    ):
        if (p / "patcher.js").is_file():
            return p
    return None


def download(url):
    req = Request(url, headers={"User-Agent": "EndcordInstaller"})
    with urlopen(req, timeout=30) as r:
        return r.read()


# The checksums come from the same place as the files, so only this proves the release is really ours.
# Keep the payload in sync with signManifest in scripts/uploadRelease.mjs
def verify_manifest(manifest):
    openssl = shutil.which("openssl")
    if not openssl:
        # The checksums come from the same server as the files, so without the signature nothing proves the release is ours
        if os.environ.get("ENDCORD_ALLOW_UNSIGNED") != "1":
            raise RuntimeError("openssl isn't installed, so the release signature can't be checked. Install openssl, or set ENDCORD_ALLOW_UNSIGNED=1 to trust the checksums alone")
        print("openssl isn't installed and ENDCORD_ALLOW_UNSIGNED is set: only the checksums are checked.")
        return
    if not manifest.get("signature"):
        raise RuntimeError("the release isn't signed")

    fields = [str(manifest.get(key) or "") for key in ("version", "hash", "updatedAt", "installerSha256")]
    if not all(fields):
        raise RuntimeError("the release is incomplete")
    # Each signed field keeps to its own line of the signed text, and the release is Endcord's four files and nothing else
    if not re.fullmatch(r"[0-9a-fA-F]{64}", fields[3]) or not all(re.fullmatch(r"[\w.+-]{1,64}", f) for f in fields[:3]):
        raise RuntimeError("the release is malformed")
    listed = manifest.get("assets")
    if not isinstance(listed, list) or sorted(str(a.get("name")) for a in listed if isinstance(a, dict)) != sorted(FILES):
        raise RuntimeError("the release doesn't list Endcord's files")
    assets = sorted("%s %s" % (a["name"], a["sha256"].lower()) for a in manifest["assets"])
    tmp = tempfile.mkdtemp(prefix="endcord-")
    try:
        key, payload, signature = (os.path.join(tmp, name) for name in ("key.pem", "payload", "signature"))
        Path(key).write_text(UPDATE_KEY, encoding="utf-8")
        Path(payload).write_bytes("\n".join(fields + assets).encode("utf-8"))
        Path(signature).write_bytes(base64.b64decode(manifest["signature"]))
        result = subprocess.run(
            [openssl, "dgst", "-sha256", "-verify", key, "-signature", signature, payload],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if result.returncode != 0:
        raise RuntimeError("the release signature doesn't match")


def fetch_checksums(url):
    manifest = json.loads(download(url + "?t=%d" % time.time()).decode("utf-8"))
    verify_manifest(manifest)
    sums = {a.get("name"): a.get("sha256") for a in manifest.get("assets", [])}
    if not all(sums.get(f) for f in FILES):
        raise RuntimeError("the release has no checksums")
    return sums


def read_bundle(url):
    """The four files from the release archive, read by name; nothing else in it is opened or written."""
    import io
    import tarfile
    files = {}
    with tarfile.open(fileobj=io.BytesIO(download(url)), mode="r:gz") as tar:
        for f in FILES:
            member = tar.getmember(f)
            if not member.isfile():
                raise RuntimeError("%s in the archive isn't a file" % f)
            files[f] = tar.extractfile(member).read()
    return files


def fetch_dist():
    os.makedirs(DIST_DIR, exist_ok=True)
    local = find_local_dist()
    if local:
        for f in FILES:
            shutil.copy2(str(local / f), os.path.join(DIST_DIR, f))
        return "local " + str(local)
    last = None
    for mirror, manifest in MIRRORS:
        try:
            sums = fetch_checksums(manifest)
            if mirror.endswith(".tar.gz"):
                files = read_bundle(mirror)
            else:
                files = {f: download(mirror + "/" + f) for f in FILES}
            for f in FILES:
                if hashlib.sha256(files[f]).hexdigest() != sums[f].lower():
                    raise RuntimeError("%s doesn't match its checksum" % f)
            # Everything is downloaded and checked before the installed copy is touched
            for f, data in files.items():
                with open(os.path.join(DIST_DIR, f), "wb") as out:
                    out.write(data)
            return mirror
        except Exception as e:
            last = e
    raise RuntimeError("Could not download Endcord files. Check https://endcord.com/download (%s)" % last)


# Same rules as PATCH_SCRIPT and RESTORE_SCRIPT in install.sh. Exit 3: no Discord app.asar to fall back to,
# exit 4: uninstall found another mod's loader in app/ and left it
PRIV_BASH = r"""#!/usr/bin/env bash
set -euo pipefail
umask 022
mode="$1"
res="$2"
min=100000
asar="$res/app.asar"
backup="$res/_app.asar"
app="$res/app"
new="$res/app.endcord-new"
prev="$res/app.endcord-prev"
size() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }
if [ "$mode" = patch ]; then
  # A full-size app.asar is Discord's own, also right after a package update; a smaller one is another mod's stub
  real=0
  [ "$(size "$asar")" -ge "$min" ] && real=1
  if [ "$real" = 0 ] && [ "$(size "$backup")" -lt "$min" ]; then
    echo "Discord's app.asar is missing in $res; reinstall Discord and try again." >&2
    exit 3
  fi
  ok=0
  rollback() {
    rm -rf "$new"
    [ "$ok" = 1 ] && return
    if [ ! -e "$app" ] && [ -e "$prev" ]; then mv "$prev" "$app"; fi
    if [ ! -e "$app" ] && [ ! -e "$asar" ] && [ "$real" = 1 ]; then mv "$backup" "$asar"; fi
  }
  trap rollback EXIT
  # The loader is complete before anything of Discord's is moved
  rm -rf "$new"
  mkdir "$new"
  printf '%s\n' '{' '  "name": "discord",' '  "main": "index.js"' '}' > "$new/package.json"
  cat > "$new/index.js" <<'EOF'
// Endcord Loader
const { join } = require('path');
const appData = process.env.APPDATA || (process.platform === 'darwin' ? join(process.env.HOME, 'Library/Application Support') : join(process.env.HOME, '.config'));
const patcherPath = join(appData, 'Endcord', 'dist', 'patcher.js');
try {
    require(patcherPath);
} catch (e) {
    console.error('[Endcord] Failed to load patcher.js, falling back to vanilla _app.asar:', e);
    require(join(__dirname, '..', '_app.asar'));
}
EOF
  if [ "$real" = 1 ]; then mv -f "$asar" "$backup"; else rm -rf "$asar"; fi
  rm -rf "$prev"
  if [ -e "$app" ]; then mv "$app" "$prev"; fi
  mv "$new" "$app"
  ok=1
  rm -rf "$prev"
else
  if [ -f "$app/index.js" ] && ! grep -q Endcord "$app/index.js"; then
    exit 4
  fi
  if [ -f "$backup" ]; then
    if [ "$(size "$asar")" -ge "$min" ]; then
      rm -f "$backup"
    else
      rm -rf "$asar"
      mv -f "$backup" "$asar"
    fi
  fi
  rm -rf "$app"
fi
"""


def run_script(cmd):
    """cmd ends in bash -s mode res; PRIV_BASH goes on its stdin."""
    r = subprocess.run(cmd, input=PRIV_BASH, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, universal_newlines=True)
    return r.returncode, (r.stderr or "").strip()


def check_script(code, err):
    if code not in (0, 4):
        raise RuntimeError(err or "exit %d" % code)
    return code


def is_system_folder(path):
    """Root works inside this folder, so it must be one only root can change, wherever a link to it came from."""
    try:
        for p in (path, os.path.dirname(path)):
            st = os.stat(p)
            if st.st_uid != 0 or st.st_mode & 0o002:
                return False
        return True
    except OSError:
        return False


def run_priv(mode, res):
    res = os.path.realpath(res)
    if not is_system_folder(res):
        raise RuntimeError("%s isn't a system folder, so it won't be changed with admin rights" % res)
    # The script comes on stdin, not from a file: a file of this user's could be swapped while the password prompt is open
    last = "neither pkexec nor sudo is installed"
    for tool in ("pkexec", "sudo"):
        if not shutil.which(tool):
            continue
        code, err = run_script([tool, "bash", "-s", mode, res])
        # pkexec: 126 = dismissed or not authorized, 127 = authentication failed
        if tool == "pkexec" and code in (126, 127):
            last = err or "pkexec exit %d" % code
            continue
        return check_script(code, err)
    raise RuntimeError("Need admin rights for %s (%s)" % (res, last))


def apply_res(mode, res):
    if os.access(res, os.W_OK):
        return check_script(*run_script(["bash", "-s", mode, res]))
    return run_priv(mode, res)


def close_discord():
    names = (
        "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment",
        "discord", "discord-canary", "discord-ptb", "discord-development",
    )
    for n in names:
        subprocess.run(["pkill", "-x", n], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)


def flatpak_id(root):
    for app_id in ("com.discordapp.DiscordCanary", "com.discordapp.DiscordPTB", "com.discordapp.DiscordDevelopment", "com.discordapp.Discord"):
        if app_id in root:
            return app_id
    return None


def grant_flatpak(root):
    app_id = flatpak_id(root)
    if not app_id or not shutil.which("flatpak"):
        return None
    target = os.path.dirname(DIST_DIR)
    result = subprocess.run(
        ["flatpak", "override", "--user", "--filesystem=" + target, app_id],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "exit %s" % result.returncode).strip()
        return "Flatpak permission failed for %s: %s" % (app_id, err)
    return "Flatpak %s can read %s" % (app_id, target)


def launch_client(root, proc):
    app_id = flatpak_id(root)
    if app_id:
        # Its binary only works inside the sandbox
        if shutil.which("flatpak"):
            subprocess.Popen(["flatpak", "run", app_id], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    for name in (proc, proc.lower(), "Discord", "discord"):
        exe = os.path.join(root, name)
        if os.path.isfile(exe) and os.access(exe, os.X_OK):
            subprocess.Popen([exe], start_new_session=True)
            return
    desktop = {
        "Discord": "discord",
        "DiscordCanary": "discord-canary",
        "DiscordPTB": "discord-ptb",
    }.get(proc)
    if desktop:
        subprocess.Popen(["gtk-launch", desktop], start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def do_action(action, roots, relaunch):
    logs = []
    def log(msg):
        logs.append(msg)

    clients = [c for c in scan_clients(roots) if c["root"] in roots or c["root"].rstrip("/") in roots]
    if action != "kill" and not clients:
        # custom path may not be in CANDIDATES
        for root in roots:
            for res in resource_dirs(root):
                clients.append({
                    "name": "Custom Path", "root": root, "resources": res,
                    "proc": "Discord", "version": read_version(root, res),
                    "running": False, "injected": has_endcord(res), "writable": True,
                })

    if action == "kill":
        close_discord()
        log("Closed Discord processes.")
        return logs

    close_discord()
    log("Closed Discord.")

    if action in ("install", "repair"):
        src = fetch_dist()
        log("Dist ready (%s)." % src)

    for c in clients:
        for res in resource_dirs(c["root"]):
            try:
                if action == "uninstall":
                    if apply_res("restore", res) == 4:
                        log("Left %s as it is: %s/app is another mod's loader" % (c["name"], res))
                    else:
                        log("Restored %s" % c["name"])
                else:
                    apply_res("patch", res)
                    log("Patched %s → %s/app" % (c["name"], res))
                    granted = grant_flatpak(c["root"])
                    if granted:
                        log(granted)
            except Exception as e:
                log("ERROR %s: %s" % (c["name"], e))

    # Only the files the installer put there; settings and themes stay, and so does dist while a Discord still loads it
    if action == "uninstall":
        if any(c["injected"] for c in scan_clients(roots)):
            log("Other Discord installs still use Endcord, so its files stay in %s" % DIST_DIR)
        else:
            shutil.rmtree(DIST_DIR, ignore_errors=True)
            log("Removed %s. Your Endcord settings are kept." % DIST_DIR)

    if relaunch and action != "uninstall":
        for c in clients:
            try:
                launch_client(c["root"], c["proc"])
            except Exception:
                pass
        log("Relaunch requested.")
    return logs


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Endcord Installer</title>
<style>
  :root {
    --bg: #0a0b12;
    --sidebar: #10111c;
    --card: #17192a;
    --card-hov: #1f2138;
    --accent: #6366f1;
    --accent-light: #818cf8;
    --green: #10b981;
    --red: #ef4444;
    --amber: #f59e0b;
    --blue: #3b82f6;
    --text: #f3f4f6;
    --dim: #9ca3af;
    --dark: #4b5563;
    --border: #1f2937;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text);
    font-family: "Segoe UI", "Ubuntu", "Noto Sans", sans-serif; user-select: none; }
  #app { display: flex; flex-direction: column; height: 100%; }
  #title {
    height: 44px; background: var(--sidebar); display: flex; align-items: center;
    padding: 0 8px 0 14px; border-bottom: 1px solid rgba(55,65,81,.18); flex-shrink: 0;
  }
  .logo {
    width: 28px; height: 28px; border-radius: 50%;
    background: linear-gradient(135deg, #5865f2, #7289da);
    color: #fff; font-weight: 700; font-size: 14px;
    display: flex; align-items: center; justify-content: center; margin-right: 8px;
  }
  .brand { font-weight: 700; font-size: 16px; }
  .brand span { font-weight: 400; color: #8c9be6; margin-left: 4px; }
  .winbtns { margin-left: auto; display: flex; }
  .winbtn { width: 44px; height: 44px; border: 0; background: transparent; color: var(--dim); cursor: pointer; font-size: 14px; font-weight: 700; }
  .winbtn:hover { color: #fff; background: #4b5563; }
  .winbtn.close:hover { background: var(--red); }
  #body { display: flex; flex: 1; min-height: 0; }
  #side {
    width: 210px; background: var(--sidebar); position: relative; overflow: hidden; flex-shrink: 0;
    border-right: 1px solid rgba(55,65,81,.14);
  }
  #beam {
    position: absolute; right: 0; width: 5px; height: 86px;
    background: linear-gradient(180deg, transparent, rgba(255,255,255,.52), transparent);
    animation: sweep 7.5s linear infinite; pointer-events: none;
  }
  @keyframes sweep { from { top: 110%; } to { top: -120px; } }
  .tab {
    margin: 10px 10px 0; padding: 10px 12px 10px 18px; border-radius: 8px; cursor: pointer;
    border: 1px solid transparent; transition: background .15s, border-color .15s, color .15s;
  }
  .tab .t { font-size: 13px; font-weight: 650; color: var(--dim); }
  .tab .d { font-size: 11px; color: var(--dark); margin-top: 2px; }
  .tab:hover { background: rgba(30,33,58,.25); border-color: rgba(129,140,248,.2); }
  .tab:hover .t { color: #fff; }
  .tab.active {
    background: linear-gradient(180deg, rgba(99,102,241,.24), rgba(99,102,241,.06));
    border-color: rgba(129,140,248,.55);
    box-shadow: 0 0 0 1px rgba(129,140,248,.12), 0 0 18px rgba(99,102,241,.12);
    position: relative;
  }
  .tab.active::before {
    content: ""; position: absolute; left: 0; top: 15px; width: 3px; height: 24px;
    background: #fff; border-radius: 2px;
  }
  .tab.active .t { color: #fff; }
  .tab.active .d { color: var(--accent-light); }
  #main { flex: 1; display: flex; flex-direction: column; padding: 16px 20px; min-width: 0; }
  .head { display: flex; align-items: center; height: 32px; }
  .head h2 { margin: 0; font-size: 11px; letter-spacing: .08em; color: var(--dark); font-weight: 600; }
  .links { margin-left: auto; display: flex; gap: 16px; }
  .link { color: var(--dim); font-size: 13px; cursor: pointer; }
  .link:hover { color: var(--accent-light); }
  #cards { margin-top: 8px; max-height: 248px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
  .card {
    height: 78px; background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    display: flex; align-items: center; padding: 0 16px 0 16px; cursor: pointer; transition: .15s;
  }
  .card:hover { background: var(--card-hov); }
  .card.sel {
    background: linear-gradient(135deg, #262a5a, #161936);
    border-color: var(--accent-light);
    box-shadow: 0 0 16px rgba(129,140,248,.18);
  }
  .chk {
    width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--dark);
    margin-right: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .card.sel .chk { background: var(--accent); border-color: #fff; }
  .chk svg { display: none; }
  .card.sel .chk svg { display: block; }
  .meta { min-width: 0; flex: 1; }
  .meta .n { font-size: 14px; font-weight: 650; }
  .meta .s { font-size: 12px; color: var(--dim); margin-top: 2px; display: flex; align-items: center; gap: 6px; }
  .meta .s.live { color: var(--green); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); }
  .meta .p { font-size: 11px; color: var(--dark); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badges { display: flex; gap: 8px; margin-left: 12px; flex-shrink: 0; }
  .badge { font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid; }
  .b-stable { color: var(--blue); background: rgba(59,130,246,.12); border-color: rgba(59,130,246,.45); }
  .b-canary { color: var(--amber); background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.45); }
  .b-ptb { color: var(--accent); background: rgba(99,102,241,.12); border-color: rgba(99,102,241,.45); }
  .b-dev { color: var(--red); background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.45); }
  .b-custom { color: var(--dim); background: rgba(156,163,175,.08); border-color: rgba(156,163,175,.35); }
  .b-end { color: var(--green); background: rgba(16,185,129,.1); border-color: rgba(16,185,129,.45); }
  .b-van { color: var(--amber); background: rgba(245,158,11,.1); border-color: rgba(245,158,11,.45); }
  .opts { height: 32px; display: flex; align-items: center; gap: 22px; margin: 8px 0; font-size: 13px; color: var(--dim); }
  .opts label { cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .opts input { accent-color: var(--accent); }
  #log {
    flex: 1; background: var(--sidebar); border-radius: 8px; padding: 10px 12px;
    font-family: Consolas, "Ubuntu Mono", monospace; font-size: 12px; color: var(--dim);
    overflow: auto; white-space: pre-wrap; min-height: 80px;
  }
  .log-ok { color: var(--green); }
  .log-err { color: var(--red); }
  .log-warn { color: var(--amber); }
  #act { height: 52px; display: flex; align-items: center; justify-content: flex-end; }
  #go {
    height: 44px; min-width: 220px; border: 0; border-radius: 9px; cursor: pointer;
    color: #fff; font-weight: 700; letter-spacing: .04em; font-size: 13px;
    background: linear-gradient(90deg, var(--accent), var(--accent-light));
    box-shadow: 0 6px 20px rgba(99,102,241,.28);
  }
  #go:hover { filter: brightness(1.08); }
  #go:disabled { background: var(--border); box-shadow: none; cursor: default; }
  #status {
    height: 36px; background: var(--sidebar); display: flex; align-items: center;
    padding: 0 16px; color: var(--dim); font-size: 13px; flex-shrink: 0;
    border-top: 1px solid rgba(55,65,81,.14);
  }
  #bar { margin-left: auto; width: 220px; height: 6px; background: var(--card); border-radius: 3px; overflow: hidden; display: none; }
  #bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--accent), var(--accent-light)); }
  .empty { color: var(--amber); padding: 24px 8px; font-size: 13px; }
</style>
</head>
<body>
<div id="app">
  <div id="title">
    <div class="logo">E</div>
    <div class="brand">Endcord<span>Installer</span></div>
    <div class="winbtns">
      <button class="winbtn" onclick="document.body.style.visibility='hidden'">—</button>
      <button class="winbtn close" onclick="quit()">✕</button>
    </div>
  </div>
  <div id="body">
    <div id="side">
      <div id="beam"></div>
      <div class="tab active" data-i="0" onclick="tab(0)"><div class="t">Install Endcord</div><div class="d">Inject client mod</div></div>
      <div class="tab" data-i="1" onclick="tab(1)"><div class="t">Uninstall</div><div class="d">Restore vanilla</div></div>
      <div class="tab" data-i="2" onclick="tab(2)"><div class="t">Repair Install</div><div class="d">Fix broken files</div></div>
      <div class="tab" data-i="3" onclick="tab(3)"><div class="t">Close Discord</div><div class="d">Force exit clients</div></div>
    </div>
    <div id="main">
      <div class="head">
        <h2>DETECTED DISCORD INSTALLATIONS</h2>
        <div class="links">
          <div class="link" onclick="addPath()">+ Custom Path</div>
          <div class="link" onclick="refresh()">Refresh</div>
        </div>
      </div>
      <div id="cards"></div>
      <div class="opts">
        <label><input type="checkbox" id="all" checked onchange="selAll(this.checked)"> Select All</label>
        <label><input type="checkbox" id="relaunch" checked> Relaunch Discord after action</label>
      </div>
      <div id="log"></div>
      <div id="act"><button id="go" onclick="go()">INSTALL ENDCORD</button></div>
    </div>
  </div>
  <div id="status">Ready<div id="bar"><i></i></div></div>
</div>
<script>
const API_HEADERS = {"Content-Type":"application/json","X-Endcord-Token":"__TOKEN__"};
const ACTIONS = ["install","uninstall","repair","kill"];
const LABELS = ["INSTALL ENDCORD","UNINSTALL ENDCORD","REPAIR INSTALLATION","CLOSE ALL DISCORD"];
const MODES = ["Install","Uninstall","Repair","Close Discord"];
let mode = 0, clients = [], extra = [], selected = new Set();

function log(msg, cls) {
  const el = document.getElementById("log");
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}
function status(t) { document.querySelector("#status").firstChild.textContent = t; }
function edition(name) {
  if (name.includes("Stable")) return ["STABLE","b-stable"];
  if (name.includes("Canary")) return ["CANARY","b-canary"];
  if (name.includes("PTB")) return ["PTB","b-ptb"];
  if (name.includes("Dev")) return ["DEV","b-dev"];
  return ["CUSTOM","b-custom"];
}
function render() {
  const box = document.getElementById("cards");
  box.innerHTML = "";
  if (!clients.length) {
    box.innerHTML = '<div class="empty">No Discord installations detected. Use + Custom Path, or install the .deb / .tar.gz / Flatpak build (Snap is not supported).</div>';
    return;
  }
  clients.forEach((c, i) => {
    const on = selected.has(c.root);
    const ed = edition(c.name);
    const div = document.createElement("div");
    div.className = "card" + (on ? " sel" : "");
    div.onclick = () => { if (selected.has(c.root)) selected.delete(c.root); else selected.add(c.root); render(); };
    div.innerHTML = `<div class="chk"><svg width="12" height="10" viewBox="0 0 12 10"><path d="M1 5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></div>
      <div class="meta">
        <div class="n">${esc(c.name)}</div>
        <div class="s${c.running?" live":""}">${c.running?'<span class="dot"></span>':""}${esc(c.version)} • ${c.running?"Running":"Closed"}</div>
        <div class="p">${esc(c.resources)}</div>
      </div>
      <div class="badges">
        <span class="badge ${ed[1]}">${ed[0]}</span>
        <span class="badge ${c.injected?"b-end":"b-van"}">${c.injected?"ENDCORD":"VANILLA"}</span>
      </div>`;
    box.appendChild(div);
  });
  document.getElementById("all").checked = clients.length > 0 && clients.every(c => selected.has(c.root));
}
function esc(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function tab(i){
  mode = i;
  document.querySelectorAll(".tab").forEach((t,n)=>t.classList.toggle("active", n===i));
  document.getElementById("go").textContent = LABELS[i];
  clients.forEach(c => selected.add(c.root));
  render();
  status("Selected Mode: " + MODES[i]);
}
function selAll(on){ clients.forEach(c => on ? selected.add(c.root) : selected.delete(c.root)); render(); }
async function refresh(){
  const r = await fetch("/api/scan", {method:"POST", headers:API_HEADERS, body: JSON.stringify({extra})});
  const data = await r.json();
  clients = data.clients || [];
  selected = new Set(clients.map(c => c.root));
  render();
  if (data.snap) log("Snap Discord is read-only — Endcord cannot patch it.", "log-warn");
  if (!clients.length) { log("No Discord installations detected on this machine.", "log-warn"); status("No Discord installations found"); }
  else { log("Detected " + clients.length + " Discord client installation(s).", "log-ok"); status("Ready"); }
}
async function addPath(){
  const p = prompt("Discord folder (contains resources/app.asar):");
  if (!p) return;
  extra.push(p);
  await refresh();
}
function setBusy(on, pct){
  document.getElementById("go").disabled = on;
  const bar = document.getElementById("bar");
  bar.style.display = on ? "block" : "none";
  bar.firstChild.style.width = (pct||0) + "%";
}
async function go(){
  const roots = [...selected];
  if (mode !== 3 && !roots.length) { log("Select at least one Discord.", "log-err"); return; }
  setBusy(true, 15);
  status("Working…");
  try {
    setBusy(true, 40);
    const r = await fetch("/api/action", {method:"POST", headers:API_HEADERS,
      body: JSON.stringify({action: ACTIONS[mode], roots, relaunch: document.getElementById("relaunch").checked})});
    const data = await r.json();
    setBusy(true, 90);
    (data.logs||[]).forEach(l => log(l, /ERROR/i.test(l)?"log-err":"log-ok"));
    if (data.error) log(data.error, "log-err");
    await refresh();
    status(data.error ? "Failed" : "Done");
  } catch (e) {
    log(String(e), "log-err");
    status("Failed");
  }
  setBusy(false, 100);
}
async function quit(){ try { await fetch("/api/quit", {headers:API_HEADERS}); } catch(e) {} window.close(); }
refresh();
</script>
</body>
</html>
"""


def token_matches(value):
    return hmac.compare_digest(value.encode("utf-8", "replace"), TOKEN.encode("utf-8"))


def same(value, expected):
    return hmac.compare_digest(value.encode("utf-8", "replace"), expected.encode("utf-8"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _json(self, obj, code=200):
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self):
        host = self.headers.get("Host") or ""
        token = self.headers.get("X-Endcord-Token") or ""
        return host == "127.0.0.1:%d" % self.server.server_address[1] and token_matches(token)

    def _may_open_page(self, query):
        """The one-time code from the window's address, or the cookie the page got with it."""
        global PAGE_OPENED
        cookies = (self.headers.get("Cookie") or "").replace(" ", "").split(";")
        if any(same(c, "endcord=" + PAGE_COOKIE) for c in cookies):
            return True
        if not same(query.replace("code=", "", 1), PAGE_CODE):
            return False
        with PAGE_LOCK:
            if PAGE_OPENED:
                # Someone else already used the code: whoever it was holds the token now, so nothing more is served
                QUIT.set()
                return False
            PAGE_OPENED = True
        return True

    def _html(self):
        raw = HTML.replace("__TOKEN__", TOKEN).encode("utf-8")
        self.send_response(200)
        self.send_header("Set-Cookie", "endcord=%s; HttpOnly; SameSite=Strict; Path=/" % PAGE_COOKIE)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in ("/", "/index.html"):
            if self._may_open_page(query):
                self._html()
            else:
                self.send_error(403)
        elif path == "/api/quit" and self._authorized():
            self._json({"ok": True})
            QUIT.set()
        elif path == "/api/quit":
            self.send_error(403)
        else:
            self.send_error(404)

    def do_POST(self):
        if not self._authorized():
            self.send_error(403)
            return
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        path = self.path.split("?", 1)[0]
        if path == "/api/scan":
            extra = body.get("extra") or []
            self._json({"clients": scan_clients(extra), "snap": snap_warning()})
        elif path == "/api/action":
            try:
                logs = do_action(body.get("action") or "install", body.get("roots") or [], bool(body.get("relaunch")))
                self._json({"logs": logs})
            except Exception as e:
                self._json({"logs": [], "error": str(e)}, 500)
        elif path == "/api/quit":
            self._json({"ok": True})
            QUIT.set()
        else:
            self.send_error(404)


def try_gtk(url):
    try:
        import gi
        gi.require_version("Gtk", "3.0")
        try:
            gi.require_version("WebKit2", "4.1")
        except ValueError:
            gi.require_version("WebKit2", "4.0")
        from gi.repository import Gtk, WebKit2, GLib
    except Exception:
        return False

    win = Gtk.Window(title="Endcord Installer")
    win.set_default_size(880, 620)
    win.set_resizable(False)
    web = WebKit2.WebView()
    web.load_uri(url)
    win.add(web)
    win.connect("destroy", lambda *_: (QUIT.set(), Gtk.main_quit()))

    def poll():
        if QUIT.is_set():
            Gtk.main_quit()
            return False
        return True

    GLib.timeout_add(250, poll)
    win.show_all()
    Gtk.main()
    return True


def try_chrome(url):
    bins = (
        "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
        "microsoft-edge", "microsoft-edge-stable", "brave-browser",
    )
    for b in bins:
        path = shutil.which(b)
        if not path:
            continue
        profile = tempfile.mkdtemp(prefix="endcord-chrome-")
        try:
            p = subprocess.Popen([
                path, "--app=" + url, "--window-size=880,620",
                "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
            ])
            while p.poll() is None and not QUIT.is_set():
                time.sleep(0.2)
            if p.poll() is None:
                p.terminate()
            return True
        except Exception:
            continue
        finally:
            shutil.rmtree(profile, ignore_errors=True)
    return False


def open_window(url):
    if try_gtk(url):
        return
    if try_chrome(url):
        return
    webbrowser.open(url)
    print("Opened Endcord Installer in your browser:", url)
    QUIT.wait()


def main():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    url = "http://127.0.0.1:%d/?code=%s" % (port, PAGE_CODE)
    try:
        open_window(url)
    finally:
        QUIT.set()
        httpd.shutdown()


if __name__ == "__main__":
    if "--cli" in sys.argv:
        print("Use ../install.sh --cli")
        sys.exit(2)
    # Files written as root would leave ~/.config/Endcord unwritable for Discord
    if os.geteuid() == 0:
        print("Run the Endcord installer as your normal user, not root. It asks for your password only if a Discord install needs it.", file=sys.stderr)
        sys.exit(1)
    main()
