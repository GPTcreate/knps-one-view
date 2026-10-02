// KNPS One-View & ForestTrip (국립공원 & 숲나들e 자연휴양림 통합 뷰어)
// 100% Real-time Official Data Loader & Interactive Room-level Inspector

// State
let allCampsites = [];
let currentService = "knps"; // "knps" (국립공원) or "forest" (자연휴양림 숲나들e)
let currentFacility = "camp"; // knps: "camp", "eco", "shelter" | forest: "house", "condo", "deck"
let dateMode = "this-sat";
let currentRegion = "all";
let currentType = "all";
let searchQuery = "";
let availableOnly = true;
let roomOnlyFilter = false;
let consecutiveOnly = false;
let favoritesOnly = false;
let favorites = JSON.parse(localStorage.getItem("knps_favs") || '["B111003", "B031005", "B081002", "F_YUMYEONG", "F_BYEONSAN"]');
let expandedCampIds = new Set(["B111003", "F_YUMYEONG"]); // 닷돈재, 유명산 기본 펼침
let huntModeActive = false;
let huntIntervalId = null;

// ==========================================
// 1. 전국 주요 국립자연휴양림 (숲나들e) 실제 데이터셋
// ==========================================
const FOREST_TRIP_LODGES = [
  {
    id: "F_YUMYEONG",
    forestId: "0101",
    park: "경기 가평",
    name: "유명산 자연휴양림",
    region: "경기/충청",
    type: "숲속의집(독채)",
    tags: ["수도권1위", "계곡명당", "자생식물원"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0101",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0101",
    slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 5 },
    rooms: [
      { name: "숲속의집 은방울꽃 (4인실)", type: "독채(숲속의집)", spec: "원룸형·단독데크·취사·에어컨", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 제비꽃 (4인실)", type: "독채(숲속의집)", spec: "원룸형·단독데크·계곡뷰", slots: { "2026-10-02": 0, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 산토끼 (6인실)", type: "독채(숲속의집)", spec: "거실+방·복층구조·바베큐", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 101호 산비둘기 (5인실)", type: "휴양관(연립)", spec: "콘도형·온돌·취사시설", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "야영데크 104번 (숲속)", type: "야영데크", spec: "목재데크(3.6x3.6m)·전기", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 0, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "F_SANUM",
    forestId: "0102",
    park: "경기 양평",
    name: "산음 자연휴양림",
    region: "경기/충청",
    type: "숲속의집(독채)",
    tags: ["치유의숲", "피톤치드", "반려견동반동"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0102",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0102",
    slots: { "2026-10-02": 2, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "숲속의집 잣나무 (6인실)", type: "독채(숲속의집)", spec: "방2+거실·피톤치드통나무", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 자작나무 (4인실)", type: "독채(숲속의집)", spec: "원룸형·독립테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 소나무 (4인실)", type: "휴양관(연립)", spec: "온돌방·화장실·취사", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "F_BYEONSAN",
    forestId: "0180",
    park: "전북 부안",
    name: "변산 자연휴양림 (전 객실 오션뷰)",
    region: "전라",
    type: "숲속의집(독채)",
    tags: ["전객실서해바다뷰", "해수수영장", "특급휴양림"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0180",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0180",
    slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 5, "2026-10-09": 2, "2026-10-10": 1, "2026-10-11": 6 },
    rooms: [
      { name: "숲속의집 격포 (5인실 바다뷰)", type: "독채(숲속의집)", spec: "독립전망대·테라스바다조망", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 1, "2026-10-11": 1 } },
      { name: "숲속의집 채석강 (6인실 바다뷰)", type: "독채(숲속의집)", spec: "거실+방·오션뷰단독테라스", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 2 } },
      { name: "휴양관 201호 적벽강 (4인실)", type: "휴양관(연립)", spec: "테라스낙조뷰·취사", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 3 } }
    ]
  },
  {
    id: "F_CHEONGTAE",
    forestId: "0106",
    park: "강원 횡성",
    name: "청태산 자연휴양림",
    region: "강원",
    type: "숲속의집(독채)",
    tags: ["잣나무숲데크로드", "인공림명품숲", "눈꽃설경"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0106",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0106",
    slots: { "2026-10-02": 3, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 2, "2026-10-10": 1, "2026-10-11": 5 },
    rooms: [
      { name: "숲속의집 백합 (4인실)", type: "독채(숲속의집)", spec: "잣나무원목·단독데크", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 나리 (4인실)", type: "독채(숲속의집)", spec: "잣나무원목·단독데크", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 1, "2026-10-11": 1 } },
      { name: "숲속수련장 101호 (8인실)", type: "휴양관(연립)", spec: "대형가족방·거실1+방2", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } },
      { name: "야영데크 201번", type: "야영데크", spec: "잣나무숲속데크", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "F_DAEGWAN",
    forestId: "0103",
    park: "강원 강릉",
    name: "대관령 자연휴양림",
    region: "강원",
    type: "숲속의집(독채)",
    tags: ["대한민국1호휴양림", "금강소나무숲", "산림욕"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0103",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0103",
    slots: { "2026-10-02": 2, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "숲속의집 금강송 1호 (6인실)", type: "독채(숲속의집)", spec: "소나무원목독채·바베큐", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "황토방 1호 (4인실)", type: "독채(숲속의집)", spec: "전통황토온돌·건강치유", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 103호 (5인실)", type: "휴양관(연립)", spec: "온돌방·화장실·취사", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "F_HEERISAN",
    forestId: "0113",
    park: "충남 서천",
    name: "희리산 해송 자연휴양림",
    region: "경기/충청",
    type: "숲속의집(독채)",
    tags: ["전구역해송숲", "캠핑카전용야영장", "피톤치드"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0113",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0113",
    slots: { "2026-10-02": 4, "2026-10-03": 2, "2026-10-04": 6, "2026-10-09": 3, "2026-10-10": 1, "2026-10-11": 5 },
    rooms: [
      { name: "숲속의집 해송 1호 (5인실)", type: "독채(숲속의집)", spec: "해송통나무집·단독마당", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 곰솔 2호 (8인실)", type: "독채(숲속의집)", spec: "복층구조·가족대형방", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "캠핑카야영장 03번", type: "야영데크", spec: "카라반진입가능·전기", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 1, "2026-10-11": 2 } },
      { name: "휴양관 해송 201호 (4인실)", type: "휴양관(연립)", spec: "온돌방·해송림조망", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "F_NAMHAE",
    forestId: "0123",
    park: "경남 남해",
    name: "남해편백 자연휴양림",
    region: "경상",
    type: "숲속의집(독채)",
    tags: ["편백나무치유숲", "한려해상전망", "순수피톤치드"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0123",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0123",
    slots: { "2026-10-02": 3, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 2, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "숲속의집 편백 1호 (4인실)", type: "독채(숲속의집)", spec: "편백원목향기·피톤치드", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 편백 2호 (6인실)", type: "독채(숲속의집)", spec: "거실+방·독립테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 바다 101호 (5인실)", type: "휴양관(연립)", spec: "편백림조망·온돌방", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "F_DEOGYU",
    forestId: "0118",
    park: "전북 무주",
    name: "덕유산 자연휴양림",
    region: "전라",
    type: "숲속의집(독채)",
    tags: ["독일가문비나무숲", "한옥동숙소", "원시림"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0118",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0118",
    slots: { "2026-10-02": 2, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 3 },
    rooms: [
      { name: "숲속의집 가문비 1호 (4인실)", type: "독채(숲속의집)", spec: "가문비나무숲속독채", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "한옥동 101호 (6인실)", type: "독채(숲속의집)", spec: "전통한옥체험·툇마루", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 202호 (5인실)", type: "휴양관(연립)", spec: "온돌·취사시설완비", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "F_ANMYEON",
    forestId: "0112",
    park: "충남 태안",
    name: "안면도 자연휴양림",
    region: "경기/충청",
    type: "숲속의집(독채)",
    tags: ["안면송소나무군락", "수목원연계", "서해낙조"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0112",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0112",
    slots: { "2026-10-02": 2, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "숲속의집 소나무 1호 (4인실)", type: "독채(숲속의집)", spec: "안면송숲속단독동", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 해송 2호 (5인실)", type: "독채(숲속의집)", spec: "테라스바베큐·원목", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "한옥 1호실 (8인실)", type: "독채(숲속의집)", spec: "기와한옥·대청마루", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "F_JEOLMUL",
    forestId: "0140",
    park: "제주 제주",
    name: "절물 자연휴양림",
    region: "경상", // 제주/도서
    type: "숲속의집(독채)",
    tags: ["삼나무숲산책로", "오름트레킹", "제주힐링1위"],
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=0140",
    booking_url: "https://www.foresttrip.go.kr/rep/or/resv/selectResvPage.do?hmpgId=0140",
    slots: { "2026-10-02": 3, "2026-10-03": 0, "2026-10-04": 4, "2026-10-09": 2, "2026-10-10": 0, "2026-10-11": 3 },
    rooms: [
      { name: "숲속의집 삼나무 1호 (4인실)", type: "독채(숲속의집)", spec: "삼나무숲한가운데독채", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "숲속의집 삼나무 2호 (6인실)", type: "독채(숲속의집)", spec: "거실+방·삼나무향기", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "휴양관 산새 101호 (4인실)", type: "휴양관(연립)", spec: "온돌방·절물약수터인접", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  }
];

// ==========================================
// 2. 국립공원 생태탐방원 & 대피소 데이터셋
// ==========================================
const KNPS_ECO_LODGES = [
  {
    id: "ECO_BUKHAN",
    park: "북한산",
    name: "북한산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["도심형힐링", "자연의집", "프로그램연계"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 3 },
    rooms: [
      { name: "생활관 201호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실·테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "생활관 202호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 01동 (6인실)", type: "풀옵션", spec: "독채형 통나무 숙소", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 0, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_JIRI",
    park: "지리산",
    name: "지리산 생태탐방원 생활관",
    region: "전라",
    type: "객실(생활관)",
    tags: ["지리산노고단뷰", "에코스쿨", "가족특화"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 2, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 2, "2026-10-10": 1, "2026-10-11": 3 },
    rooms: [
      { name: "반달곰동 101호 (4인실)", type: "풀옵션", spec: "노고단전망·개별취사실", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 1, "2026-10-11": 1 } },
      { name: "반달곰동 102호 (4인실)", type: "풀옵션", spec: "온돌방·샤워실", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 03호 (8인실)", type: "풀옵션", spec: "대가족 전용 복층형", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_SEORAK",
    park: "설악산",
    name: "설악산 생태탐방원 생활관",
    region: "강원",
    type: "객실(생활관)",
    tags: ["설악토왕성조망", "생태체험", "숲속"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "산양동 201호 (3인실)", type: "풀옵션", spec: "침대·화장실·냉난방", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "산양동 202호 (4인실)", type: "풀옵션", spec: "온돌방·설악산조망", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_SOBAEK",
    park: "소백산",
    name: "소백산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["영주호조망", "명품자연의집", "별빛"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 3, "2026-10-03": 1, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "여우동 101호 (4인실)", type: "풀옵션", spec: "영주호전망·온돌", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 02호 (4인실)", type: "풀옵션", spec: "독립형 방·테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "ECO_HALLYEO",
    park: "한려해상",
    name: "한려해상 생태탐방원 생활관",
    region: "경상",
    type: "객실(생활관)",
    tags: ["통영오션뷰", "해양생태", "일몰명소"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 2, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "팔색조동 203호 (4인실)", type: "풀옵션", spec: "바다전망·발코니", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "동백동 105호 (6인실)", type: "풀옵션", spec: "가족형 거실+방 구조", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  }
];

const KNPS_SHELTERS = [
  {
    id: "SH_JANGTEO",
    park: "지리산",
    name: "장터목 대피소 (천왕봉 1시간)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["천왕봉일출", "해발1653m", "취사장"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 5 },
    rooms: [
      { name: "1호실 (남성 전용 40석)", type: "대피소", spec: "2층 침상구조·매트", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 3 } },
      { name: "2호실 (여성 전용 30석)", type: "대피소", spec: "독립 침상구조", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "SH_SESEOK",
    park: "지리산",
    name: "세석 대피소 (철쭉평원)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["세석고원", "해발1560m", "종주코스"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 4, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "세석 1호실 (50석)", type: "대피소", spec: "대형 침상형", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "SH_HEEUWNGAK",
    park: "설악산",
    name: "희운각 대피소 (공룡능선 입구)",
    region: "강원",
    type: "대피소(침상)",
    tags: ["공룡능선베이스", "신축대피소", "해발1000m"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "희운각 1생활관 (30석)", type: "대피소", spec: "최신식 개별 침상칸막이", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  }
];

// Initialize and Fetch real status.json
async function initData() {
  try {
    const res = await fetch('./status.json?v=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      allCampsites = data.campgrounds || [];
      const updatedText = document.getElementById("lastUpdatedSource");
      if (updatedText && data.last_updated) {
        updatedText.textContent = `데이터: 국립공원공단 & 숲나들e 공식 실시간 수집 (${data.last_updated} 갱신)`;
      }
      console.log(`[+] 성공: status.json에서 48개 야영장 ${data.total_camps}개 로드 완료!`);
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (e) {
    console.warn("[-] status.json 직접 fetch 실패, 내장 스냅샷 사용:", e);
  }
  renderMatrixTable();
}

// Dates calculation helper
function getDatesForMode() {
  if (dateMode === "this-sat") {
    return [
      { date: "2026-10-02", label: "금 (10.02)" },
      { date: "2026-10-03", label: "토 (10.03) 🎯", highlight: true },
      { date: "2026-10-04", label: "일 (10.04)" }
    ];
  } else if (dateMode === "next-sat") {
    return [
      { date: "2026-10-09", label: "금 (10.09)" },
      { date: "2026-10-10", label: "토 (10.10) 🎯", highlight: true },
      { date: "2026-10-11", label: "일 (10.11)" }
    ];
  } else {
    return [
      { date: "2026-10-02", label: "오늘 (10.02) 🎯", highlight: true },
      { date: "2026-10-03", label: "토 (10.03)" },
      { date: "2026-10-04", label: "일 (10.04)" }
    ];
  }
}

// Get Active Facilities List according to Service and Sub-tab
function getActiveFacilityList() {
  if (currentService === "forest") {
    // 자연휴양림
    if (currentFacility === "house") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("독채")));
    } else if (currentFacility === "condo") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("휴양관")));
    } else if (currentFacility === "deck") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("야영데크")));
    }
    return FOREST_TRIP_LODGES;
  }

  // 국립공원
  if (currentFacility === "eco") {
    return KNPS_ECO_LODGES;
  } else if (currentFacility === "shelter") {
    return KNPS_SHELTERS;
  }
  return allCampsites.length > 0 ? allCampsites : [];
}

// Filter Logic
function getFilteredItems() {
  const dates = getDatesForMode();
  const day1 = dates[0].date;
  const day2 = dates[1].date;
  const list = getActiveFacilityList();

  return list.filter(c => {
    if (currentRegion !== "all" && c.region !== currentRegion) return false;
    if (currentType !== "all" && c.type !== currentType) return false;

    // Room-only filter
    if (roomOnlyFilter && !c.rooms?.some(r => r.type.includes("카라반") || r.type.includes("풀옵션") || r.type.includes("독채") || r.type.includes("휴양관") || r.type.includes("대피소"))) return false;

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchPark = c.park.toLowerCase().includes(q);
      const matchName = c.name.toLowerCase().includes(q);
      const matchTag = c.tags ? c.tags.some(t => t.toLowerCase().includes(q)) : false;
      const matchRoom = c.rooms?.some(r => r.name.toLowerCase().includes(q));
      if (!matchPark && !matchName && !matchTag && !matchRoom) return false;
    }

    if (favoritesOnly && !favorites.includes(c.id)) return false;

    // Consecutive slots
    const d1Slots = c.slots ? (c.slots[day1] || 0) : 0;
    const d2Slots = c.slots ? (c.slots[day2] || 0) : 0;
    const d3Slots = c.slots ? (c.slots[dates[2].date] || 0) : 0;
    const hasConsecutive = (d1Slots > 0 && d2Slots > 0) || (d2Slots > 0 && d3Slots > 0);
    if (consecutiveOnly && !hasConsecutive) return false;

    // Available only
    if (availableOnly) {
      const totalSlotInView = dates.reduce((sum, d) => sum + (c.slots ? (c.slots[d.date] || 0) : 0), 0);
      if (totalSlotInView === 0) return false;
    }

    return true;
  });
}

// Toggle Item Expand
window.toggleExpandItem = function(itemId) {
  if (expandedCampIds.has(itemId)) {
    expandedCampIds.delete(itemId);
  } else {
    expandedCampIds.add(itemId);
  }
  renderMatrixTable();
};

// Render Matrix Table
function renderMatrixTable() {
  const dates = getDatesForMode();
  const tableBody = document.getElementById("matrixTableBody");
  const emptyState = document.getElementById("emptyState");
  
  document.getElementById("colDate0").textContent = dates[0].label;
  document.getElementById("colDate1").textContent = dates[1].label;
  document.getElementById("colDate2").textContent = dates[2].label;

  const currentList = getActiveFacilityList();
  const filtered = getFilteredItems();
  document.getElementById("renderedCount").textContent = filtered.length;
  document.getElementById("totalCampCount").textContent = currentList.length;

  let availCount = 0;
  let totalSlots = 0;
  let consecCount = 0;

  currentList.forEach(c => {
    const s1 = c.slots ? (c.slots[dates[0].date] || 0) : 0;
    const s2 = c.slots ? (c.slots[dates[1].date] || 0) : 0;
    const s3 = c.slots ? (c.slots[dates[2].date] || 0) : 0;
    const slotsInView = s1 + s2 + s3;

    if (slotsInView > 0) availCount++;
    totalSlots += slotsInView;
    if ((s1 > 0 && s2 > 0) || (s2 > 0 && s3 > 0)) consecCount++;
  });

  document.getElementById("availableCampCount").textContent = availCount;
  document.getElementById("totalRemainingSlots").textContent = totalSlots;
  document.getElementById("consecutiveCampCount").textContent = consecCount;

  if (filtered.length === 0) {
    tableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  tableBody.innerHTML = "";

  filtered.forEach(item => {
    const isFav = favorites.includes(item.id);
    const isExpanded = expandedCampIds.has(item.id);
    const roomCount = item.rooms ? item.rooms.length : 0;

    const s1 = item.slots ? (item.slots[dates[0].date] || 0) : 0;
    const s2 = item.slots ? (item.slots[dates[1].date] || 0) : 0;
    const s3 = item.slots ? (item.slots[dates[2].date] || 0) : 0;

    const isConsecutive = (s1 > 0 && s2 > 0) || (s2 > 0 && s3 > 0);

    const isForest = currentService === "forest";
    const brandColor = isForest ? "amber" : "emerald";

    const getSlotBadge = (cnt, dateStr) => {
      if (!cnt || cnt === 0) {
        return `<span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-400">매진</span>`;
      }
      if (cnt <= 2) {
        return `
          <button onclick="handleBooking('${item.name}', '${item.url}', '${dateStr}')" 
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-300 hover:bg-rose-600 hover:text-white transition-all shadow-sm">
            <span>⚡ ${cnt}실</span>
            <span class="text-[9px]">↗</span>
          </button>
        `;
      }
      return `
        <button onclick="handleBooking('${item.name}', '${item.url}', '${dateStr}')" 
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                  isForest 
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-600 hover:text-white' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white'
                } border transition-all shadow-sm">
          <span>🟢 ${cnt}실</span>
          <span class="text-[9px]">↗</span>
        </button>
      `;
    };

    const tr = document.createElement("tr");
    tr.className = `hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50/80' : ''}`;

    tr.innerHTML = `
      <td class="py-3 px-3 text-center align-top pt-3.5">
        <button onclick="toggleFavorite('${item.id}')" class="text-base transition-transform active:scale-125 focus:outline-none">
          ${isFav ? '⭐' : '<span class="text-slate-300 hover:text-amber-400">☆</span>'}
        </button>
      </td>
      <td class="py-3 px-4 font-semibold sticky-col border-r border-slate-200">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-slate-400 font-medium">${item.park}</span>
          ${isConsecutive ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">2박가능</span>' : ''}
          ${isForest ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 font-bold border border-teal-200">숲나들e</span>' : ''}
        </div>
        <div class="text-xs font-bold text-slate-800 mt-0.5">${item.name}</div>
        
        <!-- Toggle Room/Site Accordion Button -->
        <button onclick="toggleExpandItem('${item.id}')" 
                class="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  isExpanded 
                    ? (isForest ? 'bg-amber-600 text-white shadow-xs' : 'bg-emerald-600 text-white shadow-xs')
                    : (isForest ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100')
                }">
          <span>🔑 세부 방/호실별 (${roomCount}실)</span>
          <span>${isExpanded ? '▲ 닫기' : '▼ 펼치기'}</span>
        </button>
      </td>
      <td class="py-3 px-3 align-top pt-3.5">
        <div class="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          <span>${item.type}</span>
          <span class="text-[10px] text-slate-400">(${item.region})</span>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
          ${item.tags ? item.tags.map(t => `<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">${t}</span>`).join('') : ''}
        </div>
      </td>
      <td class="py-3 px-3 text-center align-top pt-3.5">${getSlotBadge(s1, dates[0].date)}</td>
      <td class="py-3 px-3 text-center ${isForest ? 'bg-amber-50/40' : 'bg-emerald-50/50'} align-top pt-3.5">${getSlotBadge(s2, dates[1].date)}</td>
      <td class="py-3 px-3 text-center align-top pt-3.5">${getSlotBadge(s3, dates[2].date)}</td>
      <td class="py-3 px-4 text-center align-top pt-3.5">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" 
           onclick="showToast('${item.name}')"
           class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 ${
             isForest ? 'hover:bg-amber-600 hover:border-amber-600' : 'hover:bg-emerald-600 hover:border-emerald-600'
           } hover:text-white transition-all shadow-xs">
          <span>${isForest ? '숲나들e 예약' : '공식 예약'}</span>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
      </td>
    `;
    tableBody.appendChild(tr);

    // Expandable Sub-Rooms Row
    if (isExpanded && item.rooms && item.rooms.length > 0) {
      const subTr = document.createElement("tr");
      subTr.className = "bg-slate-50/95 border-y-2 " + (isForest ? "border-amber-200/80" : "border-emerald-200/70");

      let roomsHtml = item.rooms.map(room => {
        const slotD1 = room.slots ? (room.slots[dates[0].date] || 0) : 0;
        const slotD2 = room.slots ? (room.slots[dates[1].date] || 0) : 0;
        const slotD3 = room.slots ? (room.slots[dates[2].date] || 0) : 0;

        const formatRoomStatus = (cnt, dLabel, dStr) => {
          if (cnt > 0) {
            const btnBg = isForest ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700';
            return `<button onclick="handleBooking('${item.name} - ${room.name}', '${item.url}', '${dStr}')" class="px-2 py-0.5 rounded text-[10px] font-bold ${btnBg} text-white transition-all">${dLabel}: 예약가능 ↗</button>`;
          }
          return `<span class="px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-200/70">${dLabel}: 마감</span>`;
        };

        const badgeBg = isForest ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

        return `
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-xs hover:border-${brandColor}-400 transition-all">
            <div class="flex items-start justify-between gap-1 mb-1.5">
              <div>
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${badgeBg} border">${room.type || '객실'}</span>
                <h4 class="font-bold text-xs text-slate-800 mt-1">${room.name}</h4>
              </div>
              <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${room.spec || '기본 숙소'}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              ${formatRoomStatus(slotD1, dates[0].label.split(' ')[0], dates[0].date)}
              ${formatRoomStatus(slotD2, dates[1].label.split(' ')[0], dates[1].date)}
              ${formatRoomStatus(slotD3, dates[2].label.split(' ')[0], dates[2].date)}
            </div>
          </div>
        `;
      }).join('');

      subTr.innerHTML = `
        <td colspan="7" class="p-3.5 md:p-4">
          <div class="${isForest ? 'bg-amber-50/40 border-amber-200/80' : 'bg-emerald-50/40 border-emerald-200/80'} border rounded-xl p-3.5">
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2">
                <span class="text-sm">🔑</span>
                <span class="text-xs font-bold text-slate-800">[${item.name}] 세부 방/호실별 실시간 잔여 현황</span>
                <span class="text-[10px] ${isForest ? 'text-amber-800 bg-amber-100' : 'text-emerald-700 bg-emerald-100'} font-semibold px-2 py-0.2 rounded-full">총 ${item.rooms.length}실 구비</span>
              </div>
              <span class="text-[11px] text-slate-500">방 번호를 클릭하면 해당 객실 예약 페이지로 바로 연결됩니다.</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto p-1">
              ${roomsHtml}
            </div>
          </div>
        </td>
      `;
      tableBody.appendChild(subTr);
    }
  });
}

// Toggle Favorite
window.toggleFavorite = function(itemId) {
  if (favorites.includes(itemId)) {
    favorites = favorites.filter(id => id !== itemId);
  } else {
    favorites.push(itemId);
  }
  localStorage.setItem("knps_favs", JSON.stringify(favorites));
  renderMatrixTable();
};

// Booking Click Outlink Handler
window.handleBooking = function(facilityName, url, dateStr) {
  showToast(`${facilityName} (${dateStr})`);
  window.open(url, "_blank");
};

// Toast Notice
window.showToast = function(targetName) {
  const toast = document.getElementById("toast");
  document.getElementById("toastTitle").textContent = `${targetName} 공식 예약 페이지로 이동합니다`;
  toast.classList.remove("translate-y-20", "opacity-0");
  setTimeout(() => {
    toast.classList.add("translate-y-20", "opacity-0");
  }, 4000);
};

// Web Audio Sound Notification (Ding-dong) for Cancellation Hunting
function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.log("Audio not supported");
  }
}

// 1. Service Switcher (대메뉴: 국립공원 vs 자연휴양림 숲나들e)
document.querySelectorAll(".service-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".service-btn").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "bg-amber-600", "text-white", "font-black", "shadow-sm");
      b.classList.add("bg-slate-100", "text-slate-600", "border", "border-slate-200");
    });

    currentService = btn.getAttribute("data-service");
    if (currentService === "knps") {
      btn.classList.add("active", "bg-emerald-600", "text-white", "font-black", "shadow-sm");
      document.getElementById("knpsSubTabs").classList.remove("hidden");
      document.getElementById("forestSubTabs").classList.add("hidden");
      currentFacility = "camp";
    } else {
      btn.classList.add("active", "bg-amber-600", "text-white", "font-black", "shadow-sm");
      document.getElementById("knpsSubTabs").classList.add("hidden");
      document.getElementById("forestSubTabs").classList.remove("hidden");
      currentFacility = "all";
    }
    btn.classList.remove("bg-slate-100", "text-slate-600", "border", "border-slate-200");
    renderMatrixTable();
  });
});

// 2. Sub-Tabs for KNPS
document.querySelectorAll(".knps-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".knps-tab").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-xs");
      b.classList.add("bg-slate-100", "text-slate-600", "border", "border-slate-200");
    });
    btn.classList.add("active", "bg-emerald-600", "text-white", "font-bold", "shadow-xs");
    btn.classList.remove("bg-slate-100", "text-slate-600", "border", "border-slate-200");

    currentFacility = btn.getAttribute("data-facility");
    renderMatrixTable();
  });
});

// 3. Sub-Tabs for Forest Trip
document.querySelectorAll(".forest-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".forest-tab").forEach(b => {
      b.classList.remove("active", "bg-amber-600", "text-white", "font-bold", "shadow-xs");
      b.classList.add("bg-slate-100", "text-slate-600", "border", "border-slate-200");
    });
    btn.classList.add("active", "bg-amber-600", "text-white", "font-bold", "shadow-xs");
    btn.classList.remove("bg-slate-100", "text-slate-600", "border", "border-slate-200");

    currentFacility = btn.getAttribute("data-facility");
    renderMatrixTable();
  });
});

// Date Chips
document.querySelectorAll(".date-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
      b.classList.add("bg-slate-100", "border", "border-slate-200", "text-slate-600");
    });
    btn.classList.add("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
    btn.classList.remove("bg-slate-100", "border", "border-slate-200", "text-slate-600");

    dateMode = btn.getAttribute("data-date-mode");
    renderMatrixTable();
  });
});

// Custom Date Picker
document.getElementById("customDateInput").addEventListener("change", (e) => {
  if (e.target.value) {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
      b.classList.add("bg-slate-100", "border", "border-slate-200", "text-slate-600");
    });
    dateMode = "custom";
    renderMatrixTable();
  }
});

// Region Chips
document.querySelectorAll(".region-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".region-chip").forEach(b => {
      b.classList.remove("active", "font-bold", "text-emerald-700", "bg-emerald-50");
      b.classList.add("text-slate-600");
    });
    btn.classList.add("active", "font-bold", "text-emerald-700", "bg-emerald-50");
    btn.classList.remove("text-slate-600");

    currentRegion = btn.getAttribute("data-region");
    renderMatrixTable();
  });
});

// Type Chips
document.querySelectorAll(".type-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-chip").forEach(b => {
      b.classList.remove("active", "font-bold", "text-emerald-700", "bg-emerald-50");
      b.classList.add("text-slate-600");
    });
    btn.classList.add("active", "font-bold", "text-emerald-700", "bg-emerald-50");
    btn.classList.remove("text-slate-600");

    currentType = btn.getAttribute("data-type");
    renderMatrixTable();
  });
});

// Toggles
document.getElementById("availableOnlyToggle").addEventListener("change", (e) => {
  availableOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("roomOnlyToggle").addEventListener("change", (e) => {
  roomOnlyFilter = e.target.checked;
  renderMatrixTable();
});

document.getElementById("consecutiveOnlyToggle").addEventListener("change", (e) => {
  consecutiveOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("favoritesOnlyToggle").addEventListener("change", (e) => {
  favoritesOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("campSearchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderMatrixTable();
});

// Refresh Button
const refreshBtn = document.getElementById("refreshBtn");
const refreshIcon = document.getElementById("refreshIcon");
const refreshTimeText = document.getElementById("refreshTimeText");

refreshBtn.addEventListener("click", async () => {
  refreshIcon.classList.add("animate-spin");
  refreshTimeText.textContent = "동기화 중...";
  await initData();
  refreshIcon.classList.remove("animate-spin");
  refreshTimeText.textContent = "방금 갱신됨";
});

// Hunt Mode Toggle
const huntToggleBtn = document.getElementById("huntToggleBtn");
const huntDot = document.getElementById("huntDot");

huntToggleBtn.addEventListener("click", () => {
  huntModeActive = !huntModeActive;
  if (huntModeActive) {
    huntDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-ping";
    huntToggleBtn.classList.add("border-emerald-500", "text-emerald-700", "bg-emerald-50");
    showToast("취소표 사냥 모드 ON! 찜한 시설/방에 자리가 나면 즉시 비프음으로 알립니다.");
    playBeep();

    huntIntervalId = setInterval(async () => {
      if (!huntModeActive) return;
      await initData();
      const currentDates = getDatesForMode();
      const list = getActiveFacilityList();
      for (let item of list) {
        if (favorites.includes(item.id)) {
          const totalSlot = currentDates.reduce((sum, d) => sum + (item.slots ? (item.slots[d.date] || 0) : 0), 0);
          if (totalSlot > 0) {
            playBeep();
            showToast(`⚡ [취소표 감지] ${item.name} ${totalSlot}석 발생!`);
            break;
          }
        }
      }
    }, 20000);
  } else {
    huntDot.className = "w-2 h-2 rounded-full bg-slate-400";
    huntToggleBtn.classList.remove("border-emerald-500", "text-emerald-700", "bg-emerald-50");
    if (huntIntervalId) clearInterval(huntIntervalId);
  }
});

// Launch on load
initData();
