import urllib.request
import urllib.parse
import re

url = "https://reservation.knps.or.kr/reservation/campsiteList.do"
data = urllib.parse.urlencode({
    "dept_id": "B131002",
    "dept_name": "학동",
    "parent_dept_name": "한려해상",
    "prd_ctg_id": "",
    "isGreenpoint": "N"
}).encode("utf-8")

req = urllib.request.Request(
    url,
    data=data,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do",
        "X-Requested-With": "XMLHttpRequest"
    }
)

res = urllib.request.urlopen(req, timeout=10)
html = res.read().decode("utf-8", errors="ignore")

# Find TD in Table 3
td_snippets = re.findall(r'<td[^>]*>([\s\S]*?)</td>', html)
print(f"Total TDs: {len(td_snippets)}")
for i, td in enumerate(td_snippets[150:180]):
    clean = td.strip().replace('\n', ' ')
    if clean:
        print(f"  TD[{i+150}]: {clean[:120]}")
