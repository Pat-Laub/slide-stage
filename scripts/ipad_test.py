#!/usr/bin/env python3
"""Render a deck in the iOS Simulator and assert it is laid out as authored.

Playwright cannot drive Mobile Safari, and its `webkit` project is WebKit built
for macOS: it renders the decks correctly even when iOS does not. This checks
the real thing. It exists because `zoom` on the stage cancelled out perfectly
against the fit transform on every desktop engine while iOS scaled the layout
boxes without scaling the type, so the deck filled the screen with glyphs at a
third of their authored size and every desktop test still passed.

Needs Xcode's iOS Simulator. Run it after touching the stage transform, the
canvas size, or the root font size: `npm run test:ipad`. It lives here rather
than in a course repo because the stage is what it tests, so every deck built
on the extension is covered by it rather than only the one it was written for.
"""

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:4173"
DECK = "/docs/index.slides.html"
SLIDE = "#/wide-prose"
DEVICE_NAME = "slide-stage-iPad"
DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB"

# The authored canvas, from slide-stage.scss and the extension's format.
STAGE = [3744, 2106]
CONTENT = [3072, 1845]
ROOT_FONT_SIZE = 84


def sh(*args, check=True):
    return subprocess.run(args, capture_output=True, text=True, check=check).stdout


def device_udid():
    listing = sh("xcrun", "simctl", "list", "devices")
    for line in listing.splitlines():
        if DEVICE_NAME in line:
            match = re.search(r"\(([0-9A-F-]{36})\)", line)
            if match:
                return match.group(1), "Booted" in line
    print(f"Creating simulator {DEVICE_NAME}…")
    out = sh("xcrun", "simctl", "create", DEVICE_NAME, DEVICE_TYPE)
    return out.strip().splitlines()[-1].strip(), False


def server_running():
    try:
        urllib.request.urlopen(BASE + DECK, timeout=2).read(1)
        return True
    except Exception:
        return False


def collect(nonce, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/__probe?nonce={nonce}", timeout=3) as response:
                if response.status == 200:
                    return json.loads(response.read())
        except urllib.error.HTTPError:
            pass
        except Exception:
            pass
        time.sleep(2)
    return None


def main():
    server = None
    if not server_running():
        print("Starting the static server…")
        server = subprocess.Popen(
            ["node", "tests/support/static-server.js"], cwd=ROOT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(20):
            time.sleep(0.5)
            if server_running():
                break
        else:
            print("FAIL: the static server did not come up")
            return 1

    try:
        udid, booted = device_udid()
        if not booted:
            print(f"Booting {DEVICE_NAME}…")
            sh("xcrun", "simctl", "boot", udid, check=False)
            time.sleep(30)

        nonce = uuid.uuid4().hex
        url = f"{BASE}{DECK}?probe={nonce}{SLIDE}"
        print(f"Loading {DECK} in the simulator…")
        sh("xcrun", "simctl", "openurl", udid, url)

        measured = collect(nonce)
        shot = ROOT / "test-results" / "ipad.png"
        shot.parent.mkdir(exist_ok=True)
        sh("xcrun", "simctl", "io", udid, "screenshot", str(shot), check=False)

        if measured is None:
            print("FAIL: the deck never reported back (is the simulator awake?)")
            print(f"      screenshot: {shot}")
            return 1

        failures = []

        def check(label, actual, expected):
            ok = actual == expected
            print(f"  {'ok  ' if ok else 'FAIL'}  {label}: {actual}" + ("" if ok else f"  (expected {expected})"))
            if not ok:
                failures.append(label)

        print(f"\n{measured['userAgent']}")
        print(f"viewport {measured['viewport']}, stage on screen {measured['stageRect']}\n")
        check("authored stage size", measured["stageOffset"], STAGE)
        check("authored content frame", measured["contentOffset"], CONTENT)
        check("root font size", measured["rootFontSize"], ROOT_FONT_SIZE)
        check("stage CSS zoom", measured["stageZoom"], "1")

        widest = measured["widest"]
        if not widest:
            failures.append("no text found on the slide")
            print("  FAIL  no text found on the slide")
        else:
            # Authored text sits at authored sizes; iOS rescaling it is the bug.
            ok = widest["fontSize"] >= 40
            print(f"  {'ok  ' if ok else 'FAIL'}  widest block {widest['tag']} font size: {widest['fontSize']}px")
            if not ok:
                failures.append("text rescaled by the browser")

        print(f"\nscreenshot: {shot}")
        if failures:
            print(f"\nFAILED: {', '.join(failures)}")
            return 1
        print("\nPASSED: the deck renders on iOS at its authored geometry")
        return 0
    finally:
        if server:
            server.terminate()


if __name__ == "__main__":
    sys.exit(main())
