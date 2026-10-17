# 정식 확장 출시 절차

제출 ZIP: `artifacts/forest-seat-extension-1.0.0.zip`. ZIP 루트에 manifest.json이 있으며 Python·로컬 서버·개발 연결 키를 포함하지 않는다.
실설치 QA 폴더: `artifacts/chrome-extension/`. 이전 `browser-bridge/` 폴더와 다른 제품 패키지다.

## 준비된 항목

- 독립 MV3 소스, 전용 대시보드 통신, 기기 내 관측 저장과 삭제
- 16·32·48·128px PNG 아이콘
- 개인정보 안내 HTML (`extension/privacy.html`)
- 등록 소개 (`listing.txt`), 권한·데이터 처리·테스트 설명 (`review-notes.txt`)
- 허용 파일만 포함하는 빌드와 ZIP 무결성·SHA-256 검증
- 모의 월별 표 2시설 조회, 취소, 저장소·워커 복구, 발신 탭 제한, 데이터 필드 검증
- 전체 Node 53개·Python 28개 PASS. 독립 ZIP 17개 파일과 참조 자산·PNG 크기·JavaScript 문법·무결성 확인

## 실제 게시 전 남은 항목

1. 새 독립 패키지를 실제 Chrome에 로드하고 여러 시설 조회·로그인 만료·취소·재연결·삭제를 확인한다. 기존 개발 도구의 실조회 증거로 대체하지 않는다.
2. 게시용 Google 계정을 선택하고 Chrome 웹스토어 개발자로 등록한다. 계정 소유자가 개발자 약관과 등록 비용을 직접 확인한다. 계정·본인확인·결제 정보를 임의로 입력하지 않는다.
3. 개발자 표시 이름과 지원 연락처, 로그인 없이 볼 수 있는 공개 개인정보 안내 URL을 확정한다. 포함된 HTML만으로 대시보드의 공개 URL 필드가 채워지는 것은 아니다.
4. 실제 새 확장 화면의 스크린샷을 준비한다. 아이콘·홍보 이미지를 실제 조회 스크린샷이라고 제출하지 않는다. 최신 이미지 규격을 대시보드에서 확인한다.
5. 개발자 대시보드 새 항목에 ZIP 업로드 → 소개·개인정보·배포·테스트 설명 입력 → 검토 후 심사 제출.
6. 심사 결과를 확인하고 실제 스토어 URL이 생긴 후 ‘정식 출시’로 표시한다. 심사 승인을 보장하지 않는다.

## 공식 문서

- [개발자 등록](https://developer.chrome.com/docs/webstore/register)
- [등록·제출 절차](https://developer.chrome.com/docs/webstore/publish)
- [이미지 안내](https://developer.chrome.com/docs/webstore/images)
- [사용자 데이터 정책](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

기관 API 이용 신청과 Chrome 웹스토어 등록은 별개다. 공식 사이트를 이용하는 확장도 심사 정책과 해당 사이트의 이용 조건에 따라 검토되며, 스토어 승인 자체가 숲나들e의 공식 제휴를 뜻하지 않는다.
