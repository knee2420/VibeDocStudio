# 정답 예시 — Atticus 청구서 (VibeDocStudio `mm_page_3`)

* 원본: `workbench/05.llm_tuning/01.outline_extraction_v2/01.dataset/raw/Atticus_LLC_Invoice_000081709.pdf` 1쪽 (A4, DejaVu Sans · DejaVu Sans Bold)
* 후보: VibeDocStudio `catalog/vibe-architecture-minutes/document.json` 의 `mm_page_3` (편집기 `exactText` 정밀 모드, 블록 8개 고정 프레임)
* 생성기: [`atticus_vdoc_adapter.py`](./atticus_vdoc_adapter.py) + [`atticus_tune.json`](./atticus_tune.json) (크기별 오프셋 9.6pt · 8pt → −1px)
* 잰 날: 2026-10-29, 디버그 크롬 9222, `localhost:5180`

## 실행한 명령

```bash
T=.agents/tools/visual_fidelity; W=work/fidelity/atticus
F=<VibeDocStudio>/apps/studio/public/fonts
python $T/01_extract_pdf_truth.py --pdf "<Atticus_LLC_Invoice_000081709.pdf>" --out-dir $W \
  --font DejaVuSans=$F/DejaVuSans.ttf --font DejaVuSans-Bold=$F/DejaVuSans-Bold.ttf
python $T/02_measure_browser_page.py --truth $W/truth.json --out-dir $W --target-url-contains localhost:5180 \
  --page-selector "main section > div.bg-white" --page-text "SEO MINGYU" \
  --hide-selector "main section > div.bg-white button" --calibrate
python $T/03_verify_fidelity.py --truth $W/truth.json --measure $W/measure.json --json $W/verify.json --diff $W/diff.png
```

## 01 출력

```
  쪽 793×1123px | 글자 33 | 선 8 | 칠 0 | 그림 1
  글자 크기(pt): 6.6, 7.8, 8.0, 8.4, 9.6, 16.8
  PDF 글꼴: DejaVuSans, DejaVuSans-Bold
  F(DejaVuSans) = 1.1641  → line-height = 글자px × 1.1641
  잡음 하한선 (MuPDF vs PDFium): ink F1@1px 99.787% | blur±16 99.523%
```

## 02 `--calibrate` 출력 (생성기 보정값의 출처)

```
  calibrate 10.6667px: 글자상자-줄상자 위쪽 = [-1]     ← 8pt
  calibrate 12.8px:    글자상자-줄상자 위쪽 = [-1]     ← 9.6pt
  (8.8 · 10.4 · 11.2 · 22.4px 는 0)
```

## 03 판정

```
 글자 위치  33/33 개가 ±1.0px 이내 | 평균 |dx| 0.109 · |dx1| 0.11 · |dy| 0.124 | 최대 0.656px
 픽셀       ink F1@1px 97.507% (잡음 하한선 99.787%) | blur±16 97.972% | 기준 original_pdfium.png
 선         6 개 검사 (밑줄 2)
 [WARN] F-RULE-001  h 선 (76.4,469.3)-(716.6,470.1) 두께 0.8: x +4.0, x1 -4.0
 VERDICT: PASS  (FAIL 0 · WARN 1)
```

## 남은 차이와 까닭

| 무엇 | 까닭 | 손댈 수 있나 |
| :--- | :--- | :--- |
| 품목 아래 회색 선이 양쪽 4px 짧음 (`F-RULE-001`) | 원본은 표 바깥 여백까지 선을 그었고, 후보는 표 칸 테두리로 그렸다 | 가능 — 표 아래에 쪽 폭 선 블록을 따로 두면 된다 (미처리) |
| 2.4px 머리글 선이 2px | 크롬이 테두리 두께를 정수 px 로 내림 (`L-10`) | 테두리 대신 `background` 띠로 그리면 가능 (미처리) |
| ink F1 이 하한선보다 2.3%p 낮음 | 후보에만 있는 잉크 상위 영역이 모두 바닥글 링크 · 회색 글자 — 같은 모양, 더 진한 두께 (`L-11`) | 불가 — 크롬 글자 래스터라이저 몫 |

## 알아 둘 것

* 도구로 옮기기 전에는 자간 토큰을 임시 스크립트로 풀었습니다. `01` 의 풀이와 33개 덩어리 중 32개가 같고,
  끝 공백 바로 앞 단어 하나(`Contact support: ` 의 `support:`)만 글자당 0.028px 다릅니다
  (`01` 은 다음 공백의 원점까지를 폭으로 잡음 — 더 정확한 쪽). 이 생성기를 `01` 의 `truth.json` 으로 다시 돌리면
  그 줄이 약 0.1px 움직입니다. 허용 오차(1px) 안이지만, 다시 생성했다면 `02` → `03` 을 다시 돌려 숫자를 새로 받습니다.
* 같은 글자열 `$147.00` 이 6군데 있습니다. `02` 의 가장 가까운 짝짓기 없이는 5개가 "틀림"으로 나옵니다 (`L-08`).
