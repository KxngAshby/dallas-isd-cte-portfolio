import os

with open("survey_data.js", encoding="utf-8") as f:
    js_content = f.read().strip()

with open("dashboard.html", encoding="utf-8") as f:
    html = f.read()

old_tag = '<script src="survey_data.js"></script>'
new_tag = "<script>" + js_content + "</script>"
html = html.replace(old_tag, new_tag)

with open("dashboard_standalone.html", "w", encoding="utf-8") as f:
    f.write(html)

size_kb = os.path.getsize("dashboard_standalone.html") // 1024
print(f"Written: dashboard_standalone.html ({size_kb} KB)")
