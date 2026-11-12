# 쪽 블록 의미 분류(`blocks_annotate`) 지침

먼저 `read_file` 도구로 전달된 전체 쪽 이미지 경로를 실제로 열어 눈으로 확인한 뒤, 결정론적 후보 블록 목록(`blockId`, `kind`, `bbox`, 텍스트 미리보기)과 대조하여 각 비(非)표 블록의 역할·계층·기입란 여부를 확정한다. 이미지를 확인하지 않고 추측하지 않는다.

## 분류 기준
- `heading`: 섹션 제목·장/절 표지. `level` (1~4) 지정.
- `paragraph`: 일반 서술 문단.
- `listItem`: 번호·한글 자모·원문자·불릿(`•`, `-`, `※`)으로 시작하는 항목.
- `caption`: 표·그림 바로 위/아래 설명 줄 (`표 1`, `그림 2` 등).
- `note`: 각주·꼬리말·참고/비고 주석.
- `figure`: 사진·차트·다이어그램·도장·서명 이미지 영역. 도표/차트 내부 글자를 따로 살려야 하면 `"keepText": true`, 단순 그림·장식으로 남기려면 `"keepText": false`.
- `field`: 표 밖 독립 기입란. `"fieldKind"` 를 `"date"` | `"sign"` | `"box"` | `"line"` 중 하나로 지정.

## 응답 형식 (JSON 하나만 출력)
```json
{{
  "annotations": [
    {{
      "blockId": "b1",
      "kind": "heading",
      "level": 2
    }},
    {{
      "blockId": "b4",
      "kind": "figure",
      "figureKind": "chart",
      "keepText": false
    }},
    {{
      "blockId": "b6",
      "kind": "field",
      "fieldKind": "sign"
    }}
  ],
  "readingOrder": ["b1", "t0", "b4", "b6"]
}}
```
- `readingOrder` 를 생략하면 기존 읽기 순서를 유지한다. 지정할 때는 현재 쪽의 모든 블록 ID 를 빠짐없이 포함해야 한다.

