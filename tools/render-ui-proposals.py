#!/usr/bin/env python3
"""Render independent static UI mockups with Chromium, without network access."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "docs" / "ui-redesign" / "prototype.html").read_text(encoding="utf-8")
OUTPUT = ROOT / "ui-prototype-screenshots"
OUTPUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-gpu"],
    )
    for option in ("a", "b"):
        for view in ("manager", "settings"):
            page = browser.new_page(
                viewport={"width": 1440, "height": 900},
                device_scale_factor=1,
            )
            simulated_params = f"new URLSearchParams('?option={option}&view={view}')"
            page.set_content(
                HTML.replace(
                    "new URLSearchParams(window.location.search)",
                    simulated_params,
                ),
                wait_until="domcontentloaded",
            )
            assert page.locator("[data-screen].visible").count() == 1
            path = OUTPUT / f"tabverse-option-{option}-{view}.png"
            page.screenshot(path=str(path), full_page=True)
            print(f"Generated {path}")
            page.close()
    browser.close()
