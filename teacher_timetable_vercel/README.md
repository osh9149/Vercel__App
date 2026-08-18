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
