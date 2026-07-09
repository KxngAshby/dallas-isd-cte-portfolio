"""
Deploy dashboard_standalone.html to Netlify and get a live shareable URL.
No account or login required for the first deploy (Netlify Drop API).
"""

import io
import json
import os
import sys
import urllib.request
import zipfile
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, "dashboard_standalone.html")
SITE_ID_FILE = os.path.join(BASE_DIR, ".netlify_site_id")

NETLIFY_API = "https://api.netlify.com/api/v1"


def build_zip() -> bytes:
    """Package dashboard_standalone.html as index.html inside a zip."""
    buf = io.BytesIO()
    with open(HTML_FILE, "rb") as f:
        html_bytes = f.read()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", html_bytes)
    return buf.getvalue()


def deploy(token: str = "") -> dict:
    zip_bytes = build_zip()
    print(f"Built zip ({len(zip_bytes) // 1024} KB)...")

    headers = {
        "Content-Type": "application/zip",
    }

    # If we have a saved site ID, redeploy to the same URL instead of creating a new one
    existing_site_id = None
    if os.path.exists(SITE_ID_FILE):
        with open(SITE_ID_FILE) as f:
            existing_site_id = f.read().strip()

    if token:
        headers["Authorization"] = f"Bearer {token}"

    if existing_site_id and token:
        url = f"{NETLIFY_API}/sites/{existing_site_id}/deploys"
        print(f"Redeploying to existing site {existing_site_id}...")
    else:
        url = f"{NETLIFY_API}/sites"
        print("Creating new Netlify site...")

    req = urllib.request.Request(url, data=zip_bytes, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data


def main():
    if not os.path.exists(HTML_FILE):
        print("ERROR: dashboard_standalone.html not found.")
        print("Run process_surveys.py and bundle.py first.")
        sys.exit(1)

    print("=" * 60)
    print("  CTE Survey Dashboard - Netlify Deploy")
    print("=" * 60)

    # Try unauthenticated first (Netlify Drop / anonymous)
    token = ""

    # If a token is stored or passed as arg, use it
    token_file = os.path.join(BASE_DIR, ".netlify_token")
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
    elif os.path.exists(token_file):
        with open(token_file) as f:
            token = f.read().strip()

    try:
        result = deploy(token)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if e.code == 401:
            print("\nNetlify requires an access token for this deploy.")
            print("\nQuick setup (takes 2 minutes):")
            print("  1. Go to: https://app.netlify.com/user/applications/personal")
            print("     (sign up free with any email if needed)")
            print("  2. Click 'New access token', name it anything, copy it")
            print("  3. Run:  python deploy.py YOUR_TOKEN_HERE")
            print("     or save it:  echo YOUR_TOKEN > .netlify_token")
            print("     then just run:  python deploy.py")
            webbrowser.open("https://app.netlify.com/signup")
        else:
            print(f"Deploy failed (HTTP {e.code}): {body}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Save site_id so future deploys update the same URL
    site_id = result.get("site_id") or result.get("id", "")
    if site_id:
        with open(SITE_ID_FILE, "w") as f:
            f.write(site_id)

    # Netlify returns ssl_url or url depending on deploy stage
    live_url = result.get("ssl_url") or result.get("url") or result.get("deploy_ssl_url") or ""

    # For fresh sites the url comes back immediately; deploys have a deploy_ssl_url
    if not live_url:
        live_url = f"https://{result.get('subdomain', site_id)}.netlify.app"

    print("\n" + "=" * 60)
    print("  LIVE URL (share this link):")
    print(f"\n  {live_url}\n")
    print("=" * 60)
    print("\nOpening in browser...")
    webbrowser.open(live_url)

    # Save the URL to a text file for easy reference
    url_file = os.path.join(BASE_DIR, "dashboard_url.txt")
    with open(url_file, "w") as f:
        f.write(f"CTE Survey Dashboard\n{live_url}\n")
    print(f"URL also saved to: dashboard_url.txt")


if __name__ == "__main__":
    main()
