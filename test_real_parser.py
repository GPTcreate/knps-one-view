import urllib.request
import urllib.parse
import re
import json

def fetch_real_campsite_rooms(dept_id, camp_name, park_name):
    url = "https://reservation.knps.or.kr/reservation/campsiteList.do"
    data = urllib.parse.urlencode({
        "dept_id": dept_id,
        "dept_name": camp_name,
        "parent_dept_name": park_name,
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

    try:
        res = urllib.request.urlopen(req, timeout=8)
        html = res.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"Error fetching {dept_id}: {e}")
        return []

    # Find all room/site slot cells:
    # Pattern: <i title="[SITE_NAME] : [YYYY-MM-DD]" class="[CLASS]">
    pattern = r'<i\s+title="([^:]+)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})"\s+class="([^"]+)"'
    matches = re.findall(pattern, html)
    print(f"[{park_name} {camp_name} ({dept_id})] Matched {len(matches)} room-slot data points!")

    rooms_dict = {}
    for site_name, date_str, cls in matches:
        site_name = site_name.strip()
        is_available = "icon-reservation" in cls and "icon-none-reservation" not in cls
        if site_name not in rooms_dict:
            rooms_dict[site_name] = {}
        rooms_dict[site_name][date_str] = 1 if is_available else 0

    return rooms_dict

# Test with 2 popular campgrounds: 월악산 닷돈재1 (B111003) & 설악산 설악동 (B031005)
rooms_dotdon = fetch_real_campsite_rooms("B111003", "닷돈재1", "월악산")
print(f"닷돈재1 Total Sites/Rooms: {len(rooms_dotdon)}")
for s in list(rooms_dotdon.keys())[:5]:
    print(f"  Site: {s} -> Sample dates: {list(rooms_dotdon[s].items())[:3]}")

rooms_seorak = fetch_real_campsite_rooms("B031005", "설악동", "설악산")
print(f"설악동 Total Sites/Rooms: {len(rooms_seorak)}")
for s in list(rooms_seorak.keys())[:5]:
    print(f"  Site: {s} -> Sample dates: {list(rooms_seorak[s].items())[:3]}")
