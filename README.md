# 숲자리 · 웹과 Chrome 확장

여러 휴양림의 1박 빈자리와 예약대기 신청 기회를 비교합니다. 연박 기능은 제외합니다.
두 제품을 병행하며 설치 대상과 데이터 확보 방식을 구분합니다.

| 제품 | 사용자 이용 | 현재 상태 |
| --- | --- | --- |
| 웹 | 웹사이트 접속, 확장·Python 설치 불필요 | 시설 탐색·찜·공식 이동, 국립공원 현황 구현. 휴양림 실시간 API 승인·연계 준비 중 |
| Chrome 확장 | 확장 설치 후 자체 비교 화면, 숲나들e 직접 로그인 | 로컬 서버 없는 독립 MV3 패키지. 자동 검증 완료, 새 패키지 실설치·웹스토어 심사 대기 |

공식 예약·대기 신청·결제는 공식 사이트에서 직접 진행합니다. 숲자리와 산림청·숲나들e는 별개입니다.

## Chrome 확장 빌드

```powershell
python build_extension.py
```

- 스토어 업로드 ZIP: `artifacts/forest-seat-extension-1.0.0.zip`
- 실설치 QA 폴더: `artifacts/chrome-extension/`
- ZIP 루트에 manifest.json이 있으며 Python·localhost·연결 키를 사용하지 않습니다.
- 클릭한 확장 아이콘 → 숲자리 → 숲나들e 연결 → 공식 로그인 → 숲자리 검색 순서입니다.
- 권한은 storage와 숲나들e 사이트 접근으로 제한됩니다. 쿠키·비밀번호·개인 예약 내역을 읽지 않습니다.
- 관측값은 기기에 저장하며 화면에서 삭제할 수 있습니다. 개발자 서버 전송·광고 SDK·원격 실행 코드는 없습니다.

[정식 출시 준비](docs/chrome-store/release.md), [등록 문안](docs/chrome-store/listing.txt), [심사 설명](docs/chrome-store/review-notes.txt), [개인정보 안내](extension/privacy.html).
개발자 계정·지원 연락처·공개 개인정보 안내 URL·실제 화면 이미지와 실설치 검증을 마친 뒤 심사 제출합니다. ZIP 준비를 정식 출시라고 부르지 않습니다.

## 웹 운영자 실행

```powershell
python launcher.py
# http://127.0.0.1:8765
```

Python 3.10 이상. Windows에서는 `start.cmd`로 실행할 수 있습니다. 이는 웹 운영자용 소스 실행 방식이며 방문자에게 Python을 요구하는 제품이 아닙니다.
기존 서버 재사용, 다른 포트 소유자 보호, `.runtime/server.log` 기록을 지원합니다. 브라우저 없이 시작하려면 `python launcher.py --no-browser`.
현재 로컬 미리보기만 실행하며 원격 공개 배포는 수행하지 않았습니다.
웹 화면은 서버 현황을 읽고 확장 설치·숲나들e 로그인 연결을 요구하지 않습니다.
기존 개발 연결 API는 기본적으로 비활성화했습니다. 개발 목적으로만 `python server.py --operator-tools`로 켤 수 있습니다.

## 공식 API 경로

국립자연휴양림관리소의 휴양림 서비스가 디지털서비스 개방 수시신청 대상에 포함됩니다.
기관 선정·이용약관·검증서비스 승인·연계 테스트 후 운영 인증키를 받는 구조입니다.
신청 자격이 없는 조회 전용 서비스의 이용 가능 여부, 공립·사립 범위와 다음 대기 신청 가능 순위 제공은 아직 확정되지 않았습니다.
존재가 확인되지 않은 API URL이나 응답 필드를 만들어 연결된 것처럼 표시하지 않습니다.

[조사 결과와 공식 출처](docs/api/findings.md), [조회 전용 문의 초안](docs/api/inquiry.txt), [이용계획 초안](docs/api/usage-plan.txt).
공식 HWP 원본 3개는 `docs/api/official-forms/`에 있습니다. 초안 발송·기관 신청·약관 체결은 아직 하지 않았습니다.

## 공개 자료 갱신

```powershell
python scraper_real.py
python refresh_catalog.py
```

각각 국립공원 48곳의 공개 현황, 숲나들e 186곳·9권역의 시설 목록을 갱신합니다. 시설 목록은 잔여 현황이 아닙니다.
전체 실패는 이전 파일을 보존하고 부분 실패는 시설별 이전 관측 시각을 유지합니다.
30분을 넘긴 관측값·누락·실패는 현재 빈자리나 매진으로 추정하지 않습니다.
대1·대2·대3은 다음 대기 신청 가능 순위이며 개인 대기순번이 아닙니다. 없는 순위·정원·취소 확률을 추정하지 않습니다.
알림은 열린 화면에서 저장한 시설의 새로운 관측 변화만 비교하며 브라우저 종료 후 백그라운드 알림은 제공하지 않습니다.

## 개발 검증과 소스 묶음

Node.js 24.15 이상. 웹·확장 실행에 npm 라이브러리는 필요하지 않으며 테스트에만 사용합니다.

```powershell
npm ci --ignore-scripts
npm run check
npm run format:check
npm test
python -m unittest discover -s tests -p "test_*.py" -v
python build_release.py
```

웹 운영자용 소스 묶음은 `artifacts/forest-seat-web-preview.zip`입니다. 로컬 세션·로그·Git·node_modules를 제외합니다.
이전 `forest-seat-1.0.zip`은 제품 구분 이전의 개발판입니다. 새 전달물은 웹 미리보기와 독립 확장 ZIP 두 가지입니다.
현재 범위와 검증 구분은 [두 제품 운영 기준](docs/two-tracks.md), [검증 기록](docs/1.0-validation.md)에 정리합니다.
기존 `browser-bridge/`와 `status.json`은 개발·이전 자료이며 정식 확장 또는 웹 실시간 API로 표시하지 않습니다.
