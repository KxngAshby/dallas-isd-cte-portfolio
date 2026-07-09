"""
One-command update for the CTE Survey Dashboard.

Rebuilds the data, bundles it into a standalone HTML file, and redeploys to the
SAME permanent Google Apps Script URL every time (so the link you shared in
Google Chat never changes).

Usage:
    python update_dashboard.py            # full rebuild + deploy
    python update_dashboard.py --no-data  # skip re-processing surveys, just redeploy
"""

import os
import shutil
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APPS_DIR = os.path.join(BASE_DIR, "appsscript")
DEPLOY_ID_FILE = os.path.join(APPS_DIR, ".deployment_id")


def run(cmd, cwd=None, shell=False):
    print(f"\n> {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(cmd, cwd=cwd, shell=shell)
    if result.returncode != 0:
        print(f"ERROR: command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


def main():
    skip_data = "--no-data" in sys.argv

    if not os.path.exists(DEPLOY_ID_FILE):
        print("ERROR: .deployment_id not found in appsscript folder.")
        print("Cannot determine the permanent deployment to update.")
        sys.exit(1)

    with open(DEPLOY_ID_FILE, encoding="utf-8") as f:
        deployment_id = f.read().strip()

    print("=" * 60)
    print("  CTE Survey Dashboard - Update & Deploy")
    print("=" * 60)

    # 1. Re-process survey data (optional)
    if not skip_data:
        run([sys.executable, "process_surveys.py"], cwd=BASE_DIR)

    # 2. Bundle data into standalone HTML
    run([sys.executable, "bundle.py"], cwd=BASE_DIR)

    # 3. Copy into the Apps Script project folder as index.html
    src = os.path.join(BASE_DIR, "dashboard_standalone.html")
    dst = os.path.join(APPS_DIR, "index.html")
    shutil.copy2(src, dst)
    print(f"\nCopied dashboard_standalone.html -> appsscript/index.html")

    # 4. Push files to Apps Script
    run("clasp push --force", cwd=APPS_DIR, shell=True)

    # 5. Redeploy to the SAME deployment ID (permanent URL)
    run(f'clasp deploy -i {deployment_id} --description "CTE Survey Dashboard"',
        cwd=APPS_DIR, shell=True)

    url = f"https://script.google.com/macros/s/{deployment_id}/exec"
    print("\n" + "=" * 60)
    print("  DONE. Permanent link (unchanged):")
    print(f"\n  {url}\n")
    print("=" * 60)

    with open(os.path.join(BASE_DIR, "dashboard_url.txt"), "w", encoding="utf-8") as f:
        f.write(f"CTE Survey Dashboard\n{url}\n")


if __name__ == "__main__":
    main()
