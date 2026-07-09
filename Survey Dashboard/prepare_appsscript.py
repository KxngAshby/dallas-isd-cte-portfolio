"""
Prepares the CTE dashboard for Google Apps Script deployment.
Copies dashboard_standalone.html to index.html (the name Apps Script requires).
"""

import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE_DIR, "dashboard_standalone.html")
DST = os.path.join(BASE_DIR, "index.html")

if not os.path.exists(SRC):
    print("ERROR: dashboard_standalone.html not found.")
    print("Run process_surveys.py and bundle.py first.")
    raise SystemExit(1)

shutil.copy2(SRC, DST)
size_kb = os.path.getsize(DST) // 1024
print(f"Created: index.html ({size_kb} KB)")
print()
print("=" * 60)
print("  NEXT STEPS  (takes about 3 minutes)")
print("=" * 60)
print()
print("1. Go to: https://script.google.com")
print("   Click 'New project'")
print()
print("2. Replace ALL of the Code.gs content with this:")
print()
print("   ------------------------------------------------")
print("   function doGet() {")
print("     return HtmlService.createHtmlOutputFromFile('index')")
print("       .setTitle('CTE Survey Dashboard')")
print("       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);")
print("   }")
print("   ------------------------------------------------")
print()
print("3. Click the '+' next to 'Files' -> choose 'HTML'")
print("   Name it exactly:  index")
print("   (it becomes index.html automatically)")
print()
print("4. Delete all default content in index.html,")
print(f"   then paste the entire contents of:")
print(f"   {DST}")
print()
print("5. Click 'Deploy' -> 'New deployment'")
print("      Type:            Web app")
print("      Execute as:      Me")
print("      Who has access:  Anyone")
print("   Click 'Deploy' and copy the URL.")
print()
print("6. Paste that URL in Google Chat. Done.")
print()
print("=" * 60)
