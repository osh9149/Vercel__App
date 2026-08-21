# 교사 시간표 · 공강 비교 — Vercel 버전

## 기능
- GitHub 저장소에 포함된 `default-timetable.pdf`를 기본 시간표로 자동 분석
- 새 PDF 업로드 후 즉시 분석
- 교사 이름 3열 목록 / 이름 검색 / 모두 선택해제
- 교사 1명 선택: 개인 시간표 + 공강
- 교사 2명 이상 선택: 공통 공강 자동 계산
- 선택한 여러 교사 중 특정 요일·교시에 **수업이 있는 교사만 찾기**
- CSV 다운로드

## GitHub 폴더 구조
아래 폴더 전체를 GitHub 저장소의 `teacher_timetable_vercel` 폴더로 올리는 것을 권장합니다.

```
teacher_timetable_vercel/
├─ index.py
├─ requirements.txt
├─ vercel.json
├─ default-timetable.pdf
├─ README.md
└─ static/
   ├─ index.html
   ├─ style.css
   └─ app.js
```

## Vercel 배포
1. GitHub 저장소를 Vercel에서 Import
2. **Root Directory → Edit**
3. `teacher_timetable_vercel` 선택
4. Application Preset은 **Python**
5. Environment Variables는 필요 없음
6. Deploy

## 로컬 테스트
```bash
pip install -r requirements.txt
uvicorn index:app --reload
```
브라우저에서 `http://127.0.0.1:8000`

## PDF 업로드 크기
Vercel Function은 요청/응답 payload 제한이 있으므로 이 앱에서는 업로드 PDF를 약 4.5MB 이하로 제한합니다.
기본 PDF는 저장소에 포함하여 배포되므로 브라우저에서 업로드할 필요가 없습니다.

## 기본 PDF 교체
새 학기 시간표를 기본값으로 바꾸려면 `default-timetable.pdf`만 새 PDF로 교체하고 GitHub에 commit/push 하면 Vercel이 자동 재배포합니다.


## 디자인 업데이트
- 첨부 예시처럼 좌측 고정 3열 교사목록, 상단 큰 제목, 섹션형 공강/수업교사 조회 화면으로 재구성
- 공통 공강은 좌측 요약 + 우측 시간표 그리드
- 요일/교시를 바꾸면 수업 교사 결과가 자동 갱신


## V7: 관리자 비밀번호 + 브라우저 전용 PDF 변경
- 기본 비밀번호: `2580`
- 변경 위치: `static/app.js` 상단의 `ADMIN_PASSWORD`
- 새 PDF 업로드 후 분석된 시간표 데이터는 현재 브라우저의 `localStorage`에만 저장됩니다.
- 다른 사용자/다른 브라우저에는 영향을 주지 않습니다.
- 새로고침하거나 다시 접속해도 같은 브라우저에서는 변경된 시간표를 계속 사용합니다.
- `기본 시간표로 되돌리기`를 누르면 해당 브라우저의 저장된 시간표를 삭제합니다.
- 이 비밀번호는 강력한 서버 보안용이 아니라 실수 방지/간단한 화면 잠금용입니다.
