"""
CTE Survey PDF Report Generator
Renders dashboard_standalone.html in headless Chrome and exports a clean PDF.
"""

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, "dashboard_standalone.html")
OUTPUT_PDF = os.path.join(BASE_DIR, "CTE_Survey_Report.pdf")


def ensure_playwright():
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        print("Installing playwright...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "-q"])
        print("Installing Chromium browser (one-time download)...")
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        return True


def generate_pdf():
    ensure_playwright()
    from playwright.sync_api import sync_playwright

    file_url = "file:///" + HTML_FILE.replace("\\", "/")
    print(f"Opening: {file_url}")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        print("Loading dashboard...")
        page.goto(file_url, wait_until="networkidle")
        page.wait_for_timeout(2000)

        # Click through every tab to ensure all content is rendered into the DOM
        tab_ids = ["summary", "queue", "teachers", "campus", "improvements"]
        tab_labels = [
            "Executive Summary",
            "Priority Queue",
            "Teacher Cross-Reference",
            "Campus Drill-Down",
            "Improvements",
        ]
        for tab_id, label in zip(tab_ids, tab_labels):
            print(f"  Rendering tab: {label}")
            page.evaluate(f"""
                document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('hidden'));
            """)
            page.wait_for_timeout(300)

        # Force all tab panes visible for print and expand tables
        page.evaluate("""
            // Show all panes
            document.querySelectorAll('.tab-pane').forEach(el => {
                el.classList.remove('hidden');
                el.style.display = 'block';
            });
            // Hide nav elements
            const navBar = document.getElementById('nav-bar');
            const tabNav = document.getElementById('tab-nav');
            if (navBar) navBar.style.display = 'none';
            if (tabNav) tabNav.style.display = 'none';
        """)
        page.wait_for_timeout(500)

        print(f"Exporting PDF...")
        page.pdf(
            path=OUTPUT_PDF,
            format="Letter",
            landscape=True,
            print_background=True,
            margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"},
        )

        browser.close()

    size_kb = os.path.getsize(OUTPUT_PDF) // 1024
    print(f"\nDone! PDF saved: {OUTPUT_PDF} ({size_kb} KB)")
    print("You can now attach CTE_Survey_Report.pdf to an email or Teams message.")

    # Auto-open the PDF
    os.startfile(OUTPUT_PDF)


if __name__ == "__main__":
    generate_pdf()
