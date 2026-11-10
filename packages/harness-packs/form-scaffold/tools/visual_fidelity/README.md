# 📐 Visual Fidelity Tools (`.agents/tools/visual_fidelity`)

원본 PDF 한 쪽을 **브라우저 편집기 화면으로 똑같이 옮겼는지**를 숫자로 재고 판정하는 **독립 실행형 CLI 도구 묶음**입니다.

작업 에이전트의 "거의 똑같습니다" 라는 말과 스크린샷 눈대중을 믿지 않습니다. **원본 PDF 에서 뽑은 좌표**와 **브라우저에서 잰 좌표**를 맞대고,
판정은 `03` 이 내립니다. 작업자는 `03` 의 `VERDICT` 줄 없이 완료를 말하지 않습니다.
(2026-10-29 — 다른 에이전트가 3시간 동안 스크린샷을 보며 손으로 맞추다 실패한 Atticus 청구서를, 이 방식으로 33개 글자 덩어리 모두 1px 이내로 맞춘 일이 계기입니다)

쓰는 스킬: `external_pm_08_visual_fidelity_replicator`

---

## 📂 도구 목록

| 도구 스크립트 | 누가 | 역할 |
| :--- | :--- | :--- |
| **`01_extract_pdf_truth.py`** | 작업자 | 원본 PDF 한 쪽 → `truth.json`. 글자 덩어리 · 선 · 칠 · 그림 좌표(CSS px), 글꼴 세로 지표(F), 단어 · 공백별 자간 해, 원본 래스터 두 장(MuPDF · PDFium)과 **잡음 하한선** |
| **`02_measure_browser_page.py`** | 작업자 · 리뷰어 | 디버그 크롬(CDP `9222`)의 후보 쪽을 재서 `measure.json` · `candidate.png`. 같은 글자열이 여럿이면 가장 가까운 것끼리 짝짓고, 크롬이 **실제로 그린 글꼴**까지 기록. `--calibrate` 로 글자 크기별 줄 상자 오프셋 |
| **`03_verify_fidelity.py`** | 작업자(자가 검사) · 리뷰어(게이트) | `truth.json` vs `measure.json` 판정. FAIL 이 있으면 종료 코드 1. 크기별 오프셋 보정 제안 · 잉크 차이 그림(`--diff`) |
| `fidelity_core.py` | (공용) | 글꼴 지표 · 토큰 자간 풀이 · 색 · 픽셀 지표 계산 |

## 🔍 `03_verify_fidelity.py` 검사 규칙

| 규칙 ID | 수준 | 걸리는 것 |
| :--- | :--- | :--- |
| `F-CHROME-001` | FAIL | 후보 사진에 버튼 · 손잡이 같은 편집 도구 모양이 찍힘 → 측정 무효, `02 --hide-selector` 로 다시 |
| `F-ELEM-001` | FAIL | 원본 글자가 후보에 없음 |
| `F-POS-001` | FAIL | 글자 덩어리의 왼쪽(x) · 오른쪽(x1) · 위(y) 중 하나라도 `--tol-pos`(기본 1.0px) 넘게 어긋남 |
| `F-WRAP-001` | FAIL | 원본에서 한 줄인 글자가 후보에서 줄바꿈됨 |
| `F-SIZE-001` | FAIL | 계산된 글자 크기 ≠ 원본 pt × 96/72 (기본 허용 0.05px) |
| `F-FONT-001` | FAIL | 크롬이 실제로 그린 글꼴이 원본과 다름 (대체 글꼴 · 합성 굵기). 실제 글꼴을 못 읽으면 font-family 비교로 WARN |
| `F-IMG-001` | FAIL | 그림 네 변 중 하나라도 `--tol-img`(기본 1.0px) 넘게 어긋남 |
| `F-PIX-001` | FAIL | ink F1@1px 가 **잡음 하한선 - `--pix-margin`**(기본 2.5%p) 보다 낮음 |
| `F-COLOR-001` | WARN | 글자 색 채널 차이 > 8 |
| `F-RULE-001` | WARN | 선의 끝점이 `--tol-rule`(기본 1.5px) 넘게 어긋남 · 두께 차 > 0.5px · 후보에 없음 |
| `F-ULINE-001` | WARN | 원본 밑줄 글자가 후보에서 밑줄이 아님 |
| `F-KERN-001` | WARN | `font-kerning` 이 `none` 이 아님 |
| `D-STYLE` | 진단 | 원본은 크기가 3종 이상인데 후보 글자 60% 이상이 한 크기 → 서식 소실 의심 |
| `D-OFFSET` | 진단 | 같은 크기 글자들이 같은 방향으로 0.5px 이상 밀림 → 생성기 보정값 제안 (`verify.json` 의 `offset_suggestions_px`) |
| `D-INK` | 진단 | 원본에만 · 후보에만 있는 잉크가 몰린 상위 영역 좌표 |

## 💻 빠른 실행 예시

```bash
T=.agents/tools/visual_fidelity
W=work/fidelity/atticus          # 작업 폴더 (산출물은 모두 여기에)

# 1. 정답 뽑기 — 브라우저에서 쓸 글꼴 파일(공식 배포본)을 PDF 글꼴 이름에 묶어 준다
python $T/01_extract_pdf_truth.py --pdf "<원본.pdf>" --page 1 --out-dir $W \
  --font DejaVuSans=fonts/DejaVuSans.ttf --font DejaVuSans-Bold=fonts/DejaVuSans-Bold.ttf

# 2. (생성기로 후보 페이지를 만든 뒤) 처음 한 번은 보정값을 잰다
python $T/02_measure_browser_page.py --truth $W/truth.json --out-dir $W \
  --target-url-contains localhost:5180 --page-selector "main section > div.bg-white" \
  --page-text "SEO MINGYU" --hide-selector "main section > div.bg-white button" --calibrate

# 3. 판정 — 종료 코드 0 이어야 완료
python $T/03_verify_fidelity.py --truth $W/truth.json --measure $W/measure.json \
  --json $W/verify.json --diff $W/diff.png
```

Atticus 청구서(VibeDocStudio `mm_page_3`) 실측 결과:

```
 글자 위치  33/33 개가 ±1.0px 이내 | 평균 |dx| 0.109 · |dx1| 0.11 · |dy| 0.124 | 최대 0.656px
 픽셀       ink F1@1px 97.507% (잡음 하한선 99.787%) | blur±16 97.972% | 기준 original_pdfium.png
 [WARN] F-RULE-001  h 선 (76.4,469.3)-(716.6,470.1) 두께 0.8: x +4.0, x1 -4.0
 VERDICT: PASS  (FAIL 0 · WARN 1)
```

## ⚠️ 알려진 한계

- **크롬 전용입니다.** 디버그 프로필로 띄운 크롬(`--remote-debugging-port=9222`)이 필요합니다. 재는 동안 창 크기를 1920×1400, 확대율 1로 고정했다가 되돌립니다.
- 글자는 **글자열 검색**으로 찾습니다. 원본과 후보의 글자가 다르면(줄임표 · 하이픈 · 합자) `F-ELEM-001` 이 납니다. 고칠 대상은 생성기 쪽입니다.
- `--pix-margin 2.5` 는 크롬이 작은 글자를 PDF 렌더러보다 **진하게** 그리는 몫입니다 (Atticus 에서 잉크 차이의 대부분이 바닥글 링크 글자). 이 몫은 CSS 로 없앨 수 없습니다. 여백을 늘려서 통과시키지 말고, `D-INK` 영역이 정말 글자 두께뿐인지 `--diff` 그림으로 확인합니다.
- 밑줄(`text-decoration`)은 선으로 재지 않고, 원본 선이 글자 바로 아래에 있으면 **그 글자가 밑줄인지**만 확인합니다.
- 크롬은 테두리 두께를 정수 px 로 내립니다 (2.4px → 2px). 이런 차이는 `F-RULE-001` WARN 으로만 남깁니다.
- 필요한 것: Python 3.10+, `pymupdf`, `pypdfium2`(잡음 하한선), `fonttools`, `numpy`, `scipy`, `Pillow`, `websocket-client`.
