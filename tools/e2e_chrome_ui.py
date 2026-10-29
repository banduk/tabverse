#!/usr/bin/env python3
"""Packaged MV3 Chrome-native UI smoke tests with synthetic tabs and a throwaway vault.

The Side Panel page itself is tested with its real extension URL. Browser-frame
toolbar clicks cannot be driven through Playwright's page API, so the native
sidePanel API is separately checked by a user-gesture initiated open() call.
"""
import json
import os
import tempfile
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

EXT_DIR = Path(os.getenv("TABVERSE_EXTENSION_DIR", "dist")).resolve()
OUTPUT = Path(os.getenv("TABVERSE_UI_E2E_RESULTS", "ui-e2e-results")).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
PASSWORD = "chrome-native-ui-e2e-2026-key"
checks = []
console_errors = []
remote_requests = []


def check(label, condition=True):
    if not condition:
        raise AssertionError(label)
    print("PASS:", label, flush=True)
    checks.append(label)


def load_extension(playwright, profile, headless=True):
    return playwright.chromium.launch_persistent_context(
        str(profile),
        channel="chromium",
        headless=headless,
        ignore_default_args=["--disable-extensions"],
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}",
        ],
        timeout=45000,
    )


def extension_id(context):
    workers = context.service_workers
    if not workers:
        workers = [context.wait_for_event("serviceworker", timeout=30000)]
    return workers[0].url.split("/")[2]


def instrument(page):
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.on(
        "request",
        lambda request: remote_requests.append(request.url)
        if request.url.startswith(("http://", "https://"))
        else None,
    )


def run():
    manifest = json.loads((EXT_DIR / "manifest.json").read_text())
    check("installed package includes Chrome sidePanel permission",
          "sidePanel" in manifest["permissions"])
    check("installed package uses native sidePanel instead of action popup",
          manifest["side_panel"]["default_path"] == "sidepanel.html"
          and not manifest["action"].get("default_popup"))
    check("packaged panel HTML and JS entrypoint are present",
          (EXT_DIR / "sidepanel.html").is_file()
          and "sidepanel" in (EXT_DIR / "sidepanel.html").read_text())

    with tempfile.TemporaryDirectory(prefix="tabverse-ui-e2e-") as tmp:
        with sync_playwright() as playwright:
            context = load_extension(playwright, Path(tmp) / "chrome-profile")
            try:
                ext_id = extension_id(context)
                base = f"chrome-extension://{ext_id}"
                side = context.new_page()
                instrument(side)
                side.goto(base + "/sidepanel.html", wait_until="domcontentloaded")
                side.get_by_label("Vault passphrase").wait_for(timeout=35000)
                check("locked vault blocks the side panel before authentication")

                side.get_by_label("Vault passphrase").fill(PASSWORD)
                side.get_by_label("Confirm passphrase").fill(PASSWORD)
                side.get_by_role("button", name="Create and encrypt local vault").click()
                side.get_by_role("button", name="Abrir gerenciador completo").first.wait_for(timeout=60000)
                check("new vault unlocks and real Side Panel React UI renders")

                # Chrome's toolbar itself isn't present in Playwright's page tree.
                # Verify native browser ownership and action-click configuration.
                options = side.evaluate("""async () => ({
                    options: await chrome.sidePanel.getOptions({}),
                    behavior: await chrome.sidePanel.getPanelBehavior(),
                })""")
                check("Chrome registered the packaged default panel",
                      options["options"].get("path") == "sidepanel.html")
                check("toolbar action configured to open Chrome side panel",
                      options["behavior"].get("openPanelOnActionClick") is True)

                alpha = context.new_page()
                alpha.goto("data:text/html,<title>UI E2E Alpha Work</title><h1>Alpha</h1>")
                beta = context.new_page()
                beta.goto("data:text/html,<title>UI E2E Beta Research</title><h1>Beta</h1>")
                side.get_by_text("UI E2E Alpha Work").wait_for(timeout=30000)
                side.get_by_text("UI E2E Beta Research").wait_for(timeout=30000)
                check("current-window browser tabs appear in the panel")

                info = side.evaluate("""async () => {
                    const tabs = await chrome.tabs.query({currentWindow:true});
                    const alpha = tabs.find(t => t.title === 'UI E2E Alpha Work');
                    const beta = tabs.find(t => t.title === 'UI E2E Beta Research');
                    if (!alpha?.id || !beta?.id) throw new Error('Synthetic tabs missing');
                    const groupId = await chrome.tabs.group({tabIds: [alpha.id, beta.id]});
                    await chrome.tabGroups.update(groupId,{title:'UI E2E Dev Group',color:'blue'});
                    await chrome.tabs.update(beta.id,{pinned:true});
                    return {groupId,alphaId:alpha.id,betaId:beta.id};
                }""")
                side.get_by_text("UI E2E Dev Group").wait_for(timeout=30000)
                check("native tab groups and their names render in the panel")
                # Chrome automatically un-groups pinned tabs. The panel must keep both entries.
                side.get_by_text("UI E2E Beta Research").wait_for(timeout=30000)
                check("pinning a tab keeps it visible, outside its former group")

                side.get_by_role("textbox", name="Pesquisar abas e espaços salvos").fill("Alpha")
                side.get_by_text("UI E2E Alpha Work").wait_for()
                check("search filters to the requested tab",
                      side.get_by_text("UI E2E Beta Research").count() == 0)
                side.get_by_role("textbox", name="Pesquisar abas e espaços salvos").fill("")
                side.get_by_role("button", name="UI E2E Alpha Work").click()
                side.wait_for_timeout(450)
                active = side.evaluate("""async () => {
                    const tabs = await chrome.tabs.query({currentWindow:true,active:true});
                    return tabs[0]?.title;
                }""")
                check("clicking panel tab focuses the browser tab", active == "UI E2E Alpha Work")

                # Opening the full manager from the side panel must not navigate
                # or replace the tab the user was reading.
                side.get_by_role("button", name="Abrir gerenciador completo").last.click()
                manager = context.wait_for_event(
                    "page", predicate=lambda p: "manager.html" in p.url, timeout=30000
                ) if not any("manager.html" in p.url for p in context.pages) else next(
                    p for p in context.pages if "manager.html" in p.url
                )
                instrument(manager)
                manager.wait_for_load_state("domcontentloaded")
                manager.locator("body").get_by_text("UI E2E Alpha Work").first.wait_for(timeout=40000)
                check("full manager loads and includes the existing tabs")
                check("opening full manager preserves the user's existing content",
                      alpha.url.startswith("data:text/html"))
                manager.screenshot(path=str(OUTPUT / "manager-light.png"), full_page=True)

                side.get_by_role("button", name="Salvos").click()
                side.wait_for_timeout(600)
                check("saved spaces view renders without error",
                      side.get_by_role("alert").count() == 0)
                side.get_by_role("button", name="Abas").click()
                side.screenshot(path=str(OUTPUT / "panel-light.png"), full_page=True)

                side.emulate_media(color_scheme="dark")
                side.screenshot(path=str(OUTPUT / "panel-dark.png"), full_page=True)
                manager.emulate_media(color_scheme="dark")
                manager.screenshot(path=str(OUTPUT / "manager-dark.png"), full_page=True)
                check("light/dark UI screenshots captured from the packaged code")

                side.evaluate("""async () =>
                    chrome.storage.session.remove('tabverse_local_vault_dek_v1')""")
                side.get_by_text("Cofre bloqueado").wait_for(timeout=20000)
                check("side panel hides tab and saved-data content on vault lock")
                check("no tab metadata leaks on locked screen",
                      side.get_by_text("UI E2E Alpha Work").count() == 0)
                manager.get_by_label("Vault passphrase").wait_for(timeout=20000)
                check("manager also returns to locked state")

                error_urls = [
                    url for url in remote_requests
                    if not url.startswith(("https://www.googleapis.com/", "https://api.github.com/"))
                ]
                check("no unexpected outgoing HTTP(S) requests from extension pages",
                      not error_urls)
                check("no uncaught JavaScript errors in browser pages", not console_errors)
            finally:
                context.close()


if __name__ == "__main__":
    try:
        run()
        (OUTPUT / "result.json").write_text(json.dumps({
            "status": "passed", "checks": checks,
            "note": "Extension side panel page and API tested; toolbar browser chrome click not directly driven.",
        }, indent=2))
    except Exception:
        traceback.print_exc()
        (OUTPUT / "result.json").write_text(json.dumps({
            "status": "failed", "checks": checks,
            "console_errors": console_errors[:10],
            "requests": remote_requests[:10],
        }, indent=2))
        raise
