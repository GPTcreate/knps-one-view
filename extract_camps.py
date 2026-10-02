import urllib.request
import re
import json

url = "https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
raw_html = urllib.request.urlopen(req, timeout=10).read()
html = raw_html.decode("utf-8", errors="ignore")

pattern = r"goCampProductDetail\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)"
matches = re.findall(pattern, html)

all_camps = []
for p_name, c_name, dept_id, prd_id in matches:
    all_camps.append({
        "park_name": p_name,
        "camp_name": c_name,
        "dept_id": dept_id,
        "prd_id": prd_id
    })

with open("camps_meta.json", "w", encoding="utf-8") as f:
    json.dump(all_camps, f, ensure_ascii=False, indent=2)

print(f"Total camps saved: {len(all_camps)}")
with open("camps_meta.json", "r", encoding="utf-8") as f:
    data = json.load(f)
for item in data[:10]:
    print(item["park_name"], "|", item["camp_name"], "|", item["dept_id"])
