"""
Deploys the CTE dashboard to Google Apps Script as a web app.
Uses the Google Apps Script API to create the project, upload files, and deploy.
"""

import json
import os
import sys
import urllib.request
import urllib.error
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, "dashboard_standalone.html")

APPS_SCRIPT_API = "https://script.googleapis.com/v1"

CODE_GS = """\
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('CTE Survey Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
"""

MANIFEST = json.dumps({
    "timeZone": "America/Chicago",
    "dependencies": {},
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "webapp": {
        "executeAs": "USER_DEPLOYING",
        "access": "ANYONE_ANONYMOUS"
    }
})


def api(token, method, path, body=None):
    url = f"{APPS_SCRIPT_API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"API error {e.code} on {method} {path}:")
        print(err[:600])
        raise


def main():
    token = sys.argv[1] if len(sys.argv) > 1 else ""
    if not token:
        token_file = os.path.join(BASE_DIR, ".google_token")
        if os.path.exists(token_file):
            with open(token_file, encoding="utf-8") as f:
                token = f.read().strip()

    if not token:
        print("Usage: python deploy_appsscript.py YOUR_GOOGLE_TOKEN")
        sys.exit(1)

    # Save token for future runs
    with open(os.path.join(BASE_DIR, ".google_token"), "w", encoding="utf-8") as f:
        f.write(token)

    if not os.path.exists(HTML_FILE):
        print("ERROR: dashboard_standalone.html not found.")
        sys.exit(1)

    with open(HTML_FILE, encoding="utf-8") as f:
        html_content = f.read()

    print("=" * 60)
    print("  CTE Survey Dashboard - Google Apps Script Deploy")
    print("=" * 60)

    # Check for existing script ID
    script_id_file = os.path.join(BASE_DIR, ".appsscript_id")
    script_id = None
    if os.path.exists(script_id_file):
        with open(script_id_file, encoding="utf-8") as f:
            script_id = f.read().strip()
        print(f"Updating existing project: {script_id}")
    else:
        print("Creating new Apps Script project...")
        project = api(token, "POST", "/projects", {"title": "CTE Survey Dashboard"})
        script_id = project["scriptId"]
        with open(script_id_file, "w", encoding="utf-8") as f:
            f.write(script_id)
        print(f"Created project: {script_id}")

    print("Uploading files...")
    api(token, "PUT", f"/projects/{script_id}/content", {
        "files": [
            {
                "name": "appsscript",
                "type": "JSON",
                "source": MANIFEST,
            },
            {
                "name": "Code",
                "type": "SERVER_JS",
                "source": CODE_GS,
            },
            {
                "name": "index",
                "type": "HTML",
                "source": html_content,
            },
        ]
    })
    print("Files uploaded.")

    print("Creating deployment...")
    deployment = api(token, "POST", f"/projects/{script_id}/deployments", {
        "description": "CTE Survey Dashboard v1",
        "manifestFileName": "appsscript",
    })

    deploy_id = deployment.get("deploymentId", "")
    config = deployment.get("deploymentConfig", {})

    web_url = f"https://script.google.com/macros/s/{deploy_id}/exec"

    print()
    print("=" * 60)
    print("  LIVE URL (share this in Google Chat):")
    print()
    print(f"  {web_url}")
    print()
    print("=" * 60)

    # Save the URL
    with open(os.path.join(BASE_DIR, "dashboard_url.txt"), "w", encoding="utf-8") as f:
        f.write(f"CTE Survey Dashboard\n{web_url}\n")

    print("\nOpening in browser...")
    webbrowser.open(web_url)
    print("URL saved to dashboard_url.txt")


if __name__ == "__main__":
    main()
