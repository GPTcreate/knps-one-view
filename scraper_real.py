#!/usr/bin/env python3
"""
KNPS (Korea National Park Service) Official Live Availability Scraper
국립공원공단 예약시스템(reservation.knps.or.kr) 실시간 공식 데이터 수집기

- 대상: 전국 48개 국립공원 공식 야영장
- 동작: 각 야영장별 POST /reservation/campsiteList.do 호출 -> 세부 방/사이트(영지)별 실시간 예약 여부 파싱
- 산출물: status.json (야영장 요약 잔여석 + 방/사이트별 상세 잔여석 완전체)
"""

import urllib.request
import urllib.parse
import re
import json
import time
import datetime
import random
import os

CAMPS_META_FILE = os.path.join(os.path.dirname(__file__), "camps_meta.json")

# 지역 매핑 헬퍼
REGION_MAP = {
    "설악산": "강원",
    "오대산": "강원",
    "치악산": "강원",
    "태백산": "강원",
    "북한산": "경기/충청",
    "월악산": "경기/충청",
    "소백산": "경기/충청",
    "계룡산": "경기/충청",
    "태안해안": "경기/충청",
    "덕유산": "전라",
    "지리산": "전라",
    "내장산": "전라",
    "변산반도": "전라",
    "무등산": "전라",
    "월출산": "전라",
    "다도해해상": "전라",
    "가야산": "경상",
    "주왕산": "경상",
    "한려해상": "경상",
    "팔공산": "경상"
}

def load_camps_metadata():
    if not os.path.exists(CAMPS_META_FILE):
        raise FileNotFoundError(f"Missing {CAMPS_META_FILE}")
    with open(CAMPS_META_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def scrape_campsite(dept_id, camp_name, park_name):
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": "https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do",
            "X-Requested-With": "XMLHttpRequest"
        }
    )

    try:
        res = urllib.request.urlopen(req, timeout=12)
        html = res.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[-] [실패] {park_name} {camp_name} ({dept_id}): {e}")
        return None

    # 파싱: <i title="[방/사이트명] : [YYYY-MM-DD]" class="[클래스명]">
    # class="icon-reservation" -> 예약 가능
    # class="icon-none-reservation" -> 매진
    pattern = r'<i\s+title="([^:]+)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})"\s+class="([^"]+)"'
    matches = re.findall(pattern, html)

    if not matches:
        # 혹시 사이트가 없는 경우
        return None

    rooms_dict = {}
    camp_daily_slots = {}

    for site_name, date_str, cls in matches:
        site_name = site_name.strip()
        is_available = ("icon-reservation" in cls) and ("icon-none-reservation" not in cls)

        if site_name not in rooms_dict:
            # 방/사이트 유형 분류
            room_type = "자동차"
            spec = "일반 오토캠핑 사이트"
            if "카라반" in site_name or "카" in site_name and ("1" in site_name or "2" in site_name or "3" in site_name):
                room_type = "카라반"
                spec = "공단 카라반 (침대/냉난방/화장실)"
            elif "산막" in site_name or "텐트" in site_name or "카바나" in site_name or "하우스" in site_name:
                room_type = "풀옵션"
                spec = "글램핑형 풀옵션 숙소"
            elif "데크" in site_name or "목재" in site_name or site_name.startswith("B"):
                room_type = "데크"
                spec = "친환경 목재 데크 영지"
            elif "특화" in site_name:
                room_type = "특화"
                spec = "체류형 특화야영지"

            rooms_dict[site_name] = {
                "name": site_name,
                "type": room_type,
                "spec": spec,
                "slots": {}
            }

        slot_val = 1 if is_available else 0
        rooms_dict[site_name]["slots"][date_str] = slot_val

        # 야영장 전체 일자별 합계
        camp_daily_slots[date_str] = camp_daily_slots.get(date_str, 0) + slot_val

    # rooms 목록으로 변환
    rooms_list = list(rooms_dict.values())
    return {
        "daily_slots": camp_daily_slots,
        "rooms": rooms_list
    }

def run_scraper(limit=None):
    start_time = time.time()
    camps_meta = load_camps_metadata()
    print(f"[*] 총 {len(camps_meta)}개 국립공원 야영장 실제 잔여석 수집 시작...")

    if limit:
        camps_meta = camps_meta[:limit]

    output_camps = []
    success_count = 0

    for i, meta in enumerate(camps_meta):
        park_name = meta["park_name"]
        camp_name = meta["camp_name"]
        dept_id = meta["dept_id"]
        region = REGION_MAP.get(park_name, "기타")

        print(f"[{i+1}/{len(camps_meta)}] {park_name} - {camp_name} ({dept_id}) 수집 중...")
        result = scrape_campsite(dept_id, camp_name, park_name)

        # 공단 차단 방지용 딜레이
        time.sleep(random.uniform(0.2, 0.4))

        if result:
            success_count += 1
            room_count = len(result["rooms"])
            # 대표 사이트 유형 결정
            types = set(r["type"] for r in result["rooms"])
            primary_type = "자동차"
            if "풀옵션" in types:
                primary_type = "풀옵션"
            elif "카라반" in types:
                primary_type = "카라반"
            elif "데크" in types:
                primary_type = "데크"

            tags = list(types)
            if "전기" not in tags:
                tags.append("전기")

            output_camps.append({
                "id": dept_id,
                "dept_id": dept_id,
                "parkId": dept_id[:3],
                "park": park_name,
                "name": f"{camp_name} 야영장",
                "region": region,
                "type": primary_type,
                "tags": tags,
                "url": f"https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do",
                "booking_url": f"https://reservation.knps.or.kr/reservation/searchSimpleCampReservation.do",
                "slots": result["daily_slots"],
                "rooms": result["rooms"]
            })
            print(f"    [+] 성공: 총 {room_count}개 개별 방/사이트 파싱 완료")
        else:
            print(f"    [-] 건너뜀 (응답 없음 또는 비수기 휴장)")

    # 타임스탬프 (KST)
    kst_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S")

    final_payload = {
        "last_updated": kst_now,
        "total_camps": len(output_camps),
        "source": "국립공원공단 공식 실시간 예약시스템 (reservation.knps.or.kr)",
        "campgrounds": output_camps
    }

    out_file = os.path.join(os.path.dirname(__file__), "status.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    elapsed = round(time.time() - start_time, 1)
    print(f"\n[★] 완료: {success_count}개 야영장 실제 데이터 저장 완료 -> {out_file} (소요시간: {elapsed}초)")

if __name__ == "__main__":
    import sys
    # 인자로 개수 제한 가능 (테스트 시: python scraper_real.py 10)
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run_scraper(limit=limit)
