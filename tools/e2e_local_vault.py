#!/usr/bin/env python3
"""Real-browser vault smoke test: no user secrets, external service, or account."""
import json
import os
import tempfile
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

PASSWORD = "E2E-vault-test-passphrase-2026!"
WRONG_PASSWORD = "E2E-vault-wrong-passphrase"
TAB_SENTINEL = "private-e2e-legal-tab-4f5c"
NOTE_SENTINEL = "private-e2e-note-body-4f5c"
CHAT_SENTINEL = "private-e2e-ai-dialog-4f5c"
EXT_DIR = str(Path(os.environ.get("TABVERSE_EXTENSION_DIR", "dist")).resolve())
RESULT_DIR = Path(os.environ.get("TABVERSE_E2E_RESULTS", "vault-e2e-results")).resolve()
RESULT_DIR.mkdir(parents=True, exist_ok=True)

def launch(playwright, profile):
    return playwright.chromium.launch_persistent_context(
        str(profile),
        channel="chromium",
        headless=True,
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

def start_page(context, ext_id, errors):
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(
        f"chrome-extension://{ext_id}/manager.html?op=new",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    page.get_by_label("Vault passphrase").wait_for(timeout=30000)
    return page

SEED = r"""async () => {
  const tab = {
    id: "e2e-legacy-tab", createdAt: 1690000000000,
    updatedAt: 1690000000000, tabSpaceId: "e2e-space",
    title: "private-e2e-legal-tab-4f5c",
    url: "https://internal.example/private-e2e-legal-tab-4f5c",
    favIconUrl: ""
  };
  const note = {
    id: "e2e-legacy-note", createdAt: 1690000000000,
    updatedAt: 1690000000000, tabSpaceId: "e2e-space",
    name: "private-e2e-note-body-4f5c",
    data: "private-e2e-note-body-4f5c",
  };
  await chrome.storage.local.set({
    tabverse_ai_chat_v1: [{ role: "user", content: "private-e2e-ai-dialog-4f5c" }]
  });
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open("TabSpaceDB");
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("SavedTab")) {
        db.createObjectStore("SavedTab", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("SavedNote")) {
        db.createObjectStore("SavedNote", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["SavedTab", "SavedNote"], "readwrite");
      tx.objectStore("SavedTab").put(tab);
      tx.objectStore("SavedNote").put(note);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => { db.close(); resolve(true); };
    };
  });
}"""

READ_RAW = r"""async () => {
  const local = await chrome.storage.local.get(null);
  const session = await chrome.storage.session.get(null);
  const raw = await new Promise((resolve, reject) => {
    const req = indexedDB.open("TabSpaceDB");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const stores = [...db.objectStoreNames];
      const tx = db.transaction(["SavedTab", "SavedNote"], "readonly");
      const tabs = tx.objectStore("SavedTab");
      const notes = tx.objectStore("SavedNote");
      const tab = tabs.get("e2e-legacy-tab");
      const note = notes.get("e2e-legacy-note");
      const indexes = [...tabs.indexNames];
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        db.close();
        resolve({ tab: tab.result, note: note.result, indexes, stores });
      };
    };
  });
  return { raw, local, session };
}"""

def assert_sealed(value, marker, label):
    if not isinstance(value, dict) or not value.get("__vault", {}).get("__vault_v1"):
        raise AssertionError(f"{label}: missing AES-GCM envelope")
    if marker in json.dumps(value):
        raise AssertionError(f"{label}: plaintext found in raw IndexedDB")

def test():
    errors = []
    requests = []
    outcomes = []
    with tempfile.TemporaryDirectory(prefix="tabverse-vault-e2e-") as tmp:
      profile = Path(tmp) / "profile"
      with sync_playwright() as playwright:
        context = launch(playwright, profile)
        context.on("request", lambda request: requests.append(request.url) if request.url.startswith(("https://", "http://")) else None)
        page = None
        try:
          ext = extension_id(context)
          page = start_page(context, ext, errors)
          assert page.get_by_role("button", name="Create and encrypt local vault").is_visible()
          page.evaluate(SEED)
          outcomes.append("legacy IndexedDB and Chrome storage populated")
          page.get_by_label("Vault passphrase").fill(PASSWORD)
          page.get_by_label("Confirm passphrase").fill(PASSWORD)
          page.get_by_role("button", name="Create and encrypt local vault").click()
          page.wait_for_function(
              """async () => {
                const data = await chrome.storage.local.get("tabverse_local_vault_metadata_v1");
                return data.tabverse_local_vault_metadata_v1?.migrated === true;
              }""", timeout=60000,
          )
          page.get_by_label("Vault passphrase").wait_for(state="detached", timeout=35000)
          outcomes.append("initial creation and legacy migration finished")

          result = page.evaluate(READ_RAW)
          raw = result["raw"]
          assert_sealed(raw["tab"], TAB_SENTINEL, "SavedTab")
          assert_sealed(raw["note"], NOTE_SENTINEL, "SavedNote")
          assert "title" not in raw["indexes"]
          assert "url" not in raw["indexes"]
          local = result["local"]
          assert CHAT_SENTINEL not in json.dumps(local), "AI chat leaked into chrome.storage.local"
          assert local["tabverse_ai_chat_v1"].get("__vault_v1"), "AI chat was not sealed"
          assert PASSWORD not in json.dumps(local), "vault passphrase leaked into disk storage"
          assert result["session"].get("tabverse_local_vault_dek_v1"), "missing memory-only key"
          outcomes.append("raw IndexedDB fields, indexes and Chrome local storage are sealed")

          page.evaluate("""async () => {
            await chrome.storage.session.remove("tabverse_local_vault_dek_v1");
          }""")
          page.get_by_label("Vault passphrase").wait_for(timeout=30000)
          page.get_by_label("Vault passphrase").fill(WRONG_PASSWORD)
          page.get_by_role("button", name="Unlock vault").click()
          page.get_by_role("alert").get_by_text("Incorrect vault", exact=False).wait_for(timeout=20000)
          assert page.evaluate(READ_RAW)["raw"]["tab"].get("__vault"), "wrong password damaged stored data"
          outcomes.append("manual lock and wrong-password rejection passed")

          page.get_by_label("Vault passphrase").fill(PASSWORD)
          page.get_by_role("button", name="Unlock vault").click()
          page.get_by_label("Vault passphrase").wait_for(state="detached", timeout=30000)
          outcomes.append("correct-password unlock passed")
        except Exception:
          if page:
            try:
              page.screenshot(path=str(RESULT_DIR / "vault-e2e-failure.png"), full_page=True)
              (RESULT_DIR / "failure-page.txt").write_text(page.locator("body").inner_text()[:2400])
            except Exception:
              pass
          raise
        finally:
          context.close()

        context2 = launch(playwright, profile)
        page2 = None
        try:
          ext2 = extension_id(context2)
          page2 = start_page(context2, ext2, errors)
          assert ext2 == ext, "extension id changed after browser restart"
          assert not page2.evaluate("""async () =>
            Boolean((await chrome.storage.session.get("tabverse_local_vault_dek_v1"))["tabverse_local_vault_dek_v1"])
          """), "DEK survived Chrome restart"
          page2.get_by_label("Vault passphrase").fill(PASSWORD)
          page2.get_by_role("button", name="Unlock vault").click()
          page2.get_by_label("Vault passphrase").wait_for(state="detached", timeout=30000)
          raw2 = page2.evaluate(READ_RAW)
          assert_sealed(raw2["raw"]["tab"], TAB_SENTINEL, "SavedTab after restart")
          assert_sealed(raw2["raw"]["note"], NOTE_SENTINEL, "SavedNote after restart")
          outcomes.append("browser restart clears DEK and preserves encrypted records")
        finally:
          context2.close()

    forbidden = [url for url in requests if not url.startswith(("https://www.googleapis.com/", "https://api.github.com/"))]
    if forbidden:
        raise AssertionError(f"Unexpected remote requests from extension: {forbidden[:5]}")
    if errors:
        raise AssertionError("Extension Javascript runtime errors: " + "; ".join(errors[:3]))
    outcomes.append("no unexpected outbound HTTP(S) traffic")
    return outcomes

if __name__ == "__main__":
    try:
        results = test()
        for item in results:
            print("PASS:", item, flush=True)
        (RESULT_DIR / "result.json").write_text(json.dumps({"status":"passed", "checks":results}, indent=2))
    except Exception:
        print("E2E FAILED", flush=True)
        traceback.print_exc()
        (RESULT_DIR / "result.json").write_text(json.dumps({"status":"failed"}, indent=2))
        raise
