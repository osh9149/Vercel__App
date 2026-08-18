import io
import re
from functools import lru_cache
from pathlib import Path

import pdfplumber
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DEFAULT_PDF = APP_DIR / "default-timetable.pdf"

DAYS = ["월", "화", "수", "목", "금"]
PERIODS = [str(i) for i in range(1, 8)]
MAX_UPLOAD_BYTES = 4_500_000  # Vercel Function payload limit보다 약간 보수적으로 체크

app = FastAPI(title="교사 시간표 · 공강 비교")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _word_center(word):
    return (word["x0"] + word["x1"]) / 2, (word["top"] + word["bottom"]) / 2


def _parse_teacher_page(page, page_no):
    text = page.extract_text() or ""

    title_match = re.search(
        r"(?m)^\s*(\d+)\.\s*(.+?)\s*-\s*(\d+)시간\s*:", text
    )
    if not title_match:
        raise ValueError(f"{page_no}페이지에서 교사명/수업시간을 찾지 못했습니다.")

    teacher_no = int(title_match.group(1))
    raw_name = title_match.group(2).strip()
    hours_declared = int(title_match.group(3))

    room_match = re.match(r"(.+?)\(([^()]*)\)\s*$", raw_name)
    if room_match:
        teacher_name = room_match.group(1).strip()
        homeroom = room_match.group(2).strip()
    else:
        teacher_name = raw_name
        homeroom = ""

    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)

    header_candidates = [w for w in words if w["text"] == "교시"]
    if not header_candidates:
        raise ValueError(f"{page_no}페이지에서 시간표 머리글을 찾지 못했습니다.")

    header_word = header_candidates[0]
    _, header_y = _word_center(header_word)

    header_x = {}
    for label in ["교시"] + DAYS:
        candidates = []
        for w in words:
            _, cy = _word_center(w)
            if w["text"] == label and abs(cy - header_y) < 5:
                candidates.append(w)
        if not candidates:
            raise ValueError(f"{page_no}페이지에서 '{label}' 열을 찾지 못했습니다.")
        header_x[label], _ = _word_center(candidates[0])

    centers_x = [header_x["교시"]] + [header_x[d] for d in DAYS]
    x_bounds = [centers_x[0] - (centers_x[1] - centers_x[0]) / 2]
    x_bounds += [(a + b) / 2 for a, b in zip(centers_x, centers_x[1:])]
    x_bounds.append(centers_x[-1] + (centers_x[-1] - centers_x[-2]) / 2)

    period_centers_y = {}
    period_left, period_right = x_bounds[0], x_bounds[1]
    for period in range(1, 8):
        candidates = []
        for w in words:
            cx, cy = _word_center(w)
            if (
                w["text"] == str(period)
                and period_left <= cx < period_right
                and cy > header_y
            ):
                candidates.append((cy, w))
        if not candidates:
            raise ValueError(f"{page_no}페이지에서 {period}교시 행을 찾지 못했습니다.")
        period_centers_y[period] = min(candidates, key=lambda item: item[0])[0]

    centers_y = [period_centers_y[p] for p in range(1, 8)]
    y_bounds = [centers_y[0] - (centers_y[1] - centers_y[0]) / 2]
    y_bounds += [(a + b) / 2 for a, b in zip(centers_y, centers_y[1:])]
    y_bounds.append(centers_y[-1] + (centers_y[-1] - centers_y[-2]) / 2)

    schedule = {day: {period: "" for period in PERIODS} for day in DAYS}

    for day_index, day in enumerate(DAYS):
        x0, x1 = x_bounds[day_index + 1], x_bounds[day_index + 2]

        for period_index, period in enumerate(PERIODS):
            y0, y1 = y_bounds[period_index], y_bounds[period_index + 1]
            cell_words = []

            for w in words:
                cx, cy = _word_center(w)
                if x0 <= cx < x1 and y0 <= cy < y1:
                    cell_words.append(w)

            if cell_words:
                cell_words.sort(key=lambda w: (w["top"], w["x0"]))
                lines = []
                for w in cell_words:
                    if not lines or abs(w["top"] - lines[-1][0]) > 1.5:
                        lines.append([w["top"], [w]])
                    else:
                        lines[-1][1].append(w)

                schedule[day][period] = "\n".join(
                    " ".join(word["text"] for word in line_words)
                    for _, line_words in lines
                )

    extracted_hours = sum(
        bool(schedule[day][period]) for day in DAYS for period in PERIODS
    )

    return {
        "no": teacher_no,
        "name": teacher_name,
        "homeroom": homeroom,
        "hours_declared": hours_declared,
        "hours_extracted": extracted_hours,
        "schedule": schedule,
    }


def parse_timetable_pdf(pdf_bytes):
    teachers = {}
    warnings = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            try:
                info = _parse_teacher_page(page, page_no)
                teachers[info["name"]] = info
                if info["hours_declared"] != info["hours_extracted"]:
                    warnings.append(
                        f"{page_no}페이지 {info['name']}: "
                        f"표기 {info['hours_declared']}시간 / 추출 {info['hours_extracted']}시간"
                    )
            except Exception as exc:
                warnings.append(f"{page_no}페이지 분석 실패: {exc}")

    if not teachers:
        raise ValueError("PDF에서 교사 시간표를 한 건도 읽지 못했습니다.")

    ordered = dict(sorted(teachers.items(), key=lambda item: item[1]["no"]))
    return ordered, warnings


@lru_cache(maxsize=1)
def load_default_data():
    if not DEFAULT_PDF.exists():
        raise FileNotFoundError("default-timetable.pdf 파일이 없습니다.")
    return parse_timetable_pdf(DEFAULT_PDF.read_bytes())


@app.get("/", response_class=HTMLResponse)
def home():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.get("/default-timetable.pdf")
def default_pdf():
    if not DEFAULT_PDF.exists():
        raise HTTPException(status_code=404, detail="기본 PDF를 찾지 못했습니다.")
    return FileResponse(DEFAULT_PDF, media_type="application/pdf")


@app.get("/api/timetable")
def get_default_timetable():
    try:
        teachers, warnings = load_default_data()
        return {
            "source": "기본 PDF",
            "filename": DEFAULT_PDF.name,
            "teachers": teachers,
            "warnings": warnings,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/timetable")
async def upload_timetable(file: UploadFile = File(...)):
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="PDF가 너무 큽니다. Vercel 배포에서는 약 4.5MB 이하 PDF를 사용해 주세요.",
        )

    try:
        teachers, warnings = parse_timetable_pdf(pdf_bytes)
        return {
            "source": "업로드 PDF",
            "filename": file.filename or "uploaded.pdf",
            "teachers": teachers,
            "warnings": warnings,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"PDF 분석 실패: {exc}")
