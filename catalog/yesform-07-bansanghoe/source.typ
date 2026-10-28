// 반상회 회의록 (황금비율 타이트/밸런스 타이포그래피 완결 규격)
#set page(
  paper: "a4",
  margin: (top: 35.4mm, bottom: 20mm, left: 25.5mm, right: 25.9mm),
)
#set text(
  font: ("Malgun Gothic", "맑은 고딕", "Noto Sans CKR", "Apple SD Gothic Neo"),
  size: 9.5pt,
  lang: "ko",
)

#show table: it => block(spacing: 0pt, it)
#set table(stroke: 0.72pt)

// 1. 문서 메인 타이틀
#align(center)[
  #text(size: 18pt, weight: "bold", tracking: 0.35em)[반 상 회#h(1.2em)회 의 록]
  #v(2pt)
  #line(length: 215pt, stroke: 1.44pt)
]
#v(16pt)

// 전체 외곽 1.44pt 정밀 프레임
#block(
  stroke: 1.44pt,
  inset: 0pt,
  outset: 0pt,
  [
    // 2. [1구역] 일시 및 결재란 (47.6pt)
    #table(
      columns: (298.1pt, 36.2pt, 39.6pt, 42.6pt, 32.9pt),
      rows: (47.6pt),
      align: (left + horizon, center + horizon, center + horizon, center + horizon, center + horizon),
      inset: (x: 8pt),
      stroke: (x, y) => (
        top: none,
        left: if x == 0 { none } else { 0.72pt },
        right: none,
        bottom: 0.72pt
      ),
      [
        #set text(size: 9.2pt)
        *2026*년 #h(0.4em) *10*월 #h(0.4em) *27*일 #h(0.8em) *19*시 *30*분부터 #h(0.5em) *20*시 *45*분 까지
      ],
      [
        #set text(size: 9pt, weight: "medium")
        #set par(leading: 0.35em)
        몰름\ 반장
      ],
      [#text(size: 8.5pt, fill: rgb("#1d4ed8"))[(서명)]],
      [
        #set text(size: 9.5pt, weight: "medium")
        반#h(0.8em)장
      ],
      [#text(size: 9pt, fill: rgb("#b91c1c"))[*金*(인)]]
    )

    // 3. [2구역] 협의 및 결의사항 (195.0pt - 단단하고 밀도 있는 황금비율 행간)
    #table(
      columns: (54.1pt, 395.3pt),
      rows: (195.0pt),
      align: (center + horizon, left + horizon),
      inset: (col, row) => if col == 0 { (x: 4pt) } else { (x: 14pt, y: 12pt) },
      stroke: (x, y) => (
        top: none,
        left: if x == 0 { none } else { 0.72pt },
        right: none,
        bottom: 0.72pt
      ),
      [
        #set text(size: 9.8pt, weight: "bold")
        #set par(leading: 0.5em)
        협의 및\
        결의사항
      ],
      [
        #set text(size: 8.8pt)
        
        // 안건 1
        #text(weight: "bold", size: 9.2pt)[1. 단지 내 재활용 분리수거 배출 체계 개선의 건]
        #v(3.5pt) // 헤더-하위 간격: 3.5pt (밀착도와 가독성 균형)
        #block(inset: (left: 10pt))[
          #set par(leading: 0.48em) // 문장 행간: 0.48em (단단하고 또렷한 밀도)
          • 기존 수시 배출로 인한 악취 및 통행 불편 해소를 위해 매주 화·금요일 18:00~23:00 지정 시간 집중 배출제로 전환하기로 만장일치 의결함.
          #v(3pt) // 하위 불릿 간격: 3pt
          • 분리수거장 내 노후 CCTV 교체 및 조명 보강은 관리비 예비비로 즉시 집행 결정.
        ]

        #v(8pt) // 대항목 간 간격: 8pt
        // 안건 2
        #text(weight: "bold", size: 9.2pt)[2. 동절기 대비 지하주차장 소방 안전 시설 전수 점검의 건]
        #v(3.5pt)
        #block(inset: (left: 10pt))[
          #set par(leading: 0.48em)
          • 주차구역 스프링클러 헤드 누수 및 피난 유도선 훼손 상태 11월 첫째 주 집중 점검.
          #v(3pt)
          • 소화전 앞 적치물 자진 수거 안내문을 10월 말까지 전 세대에 공지하기로 함.
        ]

        #v(8pt)
        // 안건 3
        #text(weight: "bold", size: 9.2pt)[3. 가을맞이 마을 대청소 및 보행로 수목 전지 일정 수립의 건]
        #v(3.5pt)
        #block(inset: (left: 10pt))[
          #set par(leading: 0.48em)
          • 일시: 2026년 11월 7일(토) 오전 10:00 (각 통·반 자율 방범대 합동 실시)
        ]
      ]
    )

    // 4. [3구역] 건의요망 사항요지 및 임석공무원 (92.0pt)
    #table(
      columns: (54.1pt, 244.0pt, 151.3pt),
      rows: (28.0pt, 64.0pt),
      align: (center + horizon, left + horizon, center + horizon),
      stroke: (x, y) => (
        top: none,
        left: if x == 0 { none } else { 0.72pt },
        right: none,
        bottom: 0.72pt
      ),
      table.cell(rowspan: 2)[
        #set text(size: 9.8pt, weight: "bold")
        #set par(leading: 0.5em)
        건의요망\
        사항요지
      ],
      table.cell(rowspan: 2, inset: (x: 12pt, y: 10pt), align: left + horizon)[
        #set text(size: 8.8pt)
        
        #text(weight: "bold", size: 9pt)[1. 단지 후문 보행로 노후 보안등 LED 전면 교체 건의]
        #v(3pt)
        #block(inset: (left: 8pt))[
          #set par(leading: 0.48em)
          - 야간 통행 시 조도 미확보로 인한 안전사고 우려 해소 요망
        ]
        
        #v(6pt)
        #text(weight: "bold", size: 9pt)[2. 어린이 놀이터 주변 불법 이륜차 진입 방지용 볼라드 설치 요청]
      ],
      [#text(weight: "bold", size: 9.8pt, tracking: 0.15em)[임 석 공 무 원]],
      table.cell(align: left + horizon)[
        #block(inset: (left: 12pt, right: 10pt))[
          #set text(size: 9.2pt)
          #set par(leading: 0.5em)
          소#h(1.2em)속 : 행복동 주민센터 \
          #v(3pt)
          직#h(1.2em)명 : 행정주무관 \
          #v(3pt)
          #grid(
            columns: (1fr, auto),
            [성#h(1.2em)명 : 이 동 관],
            [#text(size: 9pt, fill: rgb("#b91c1c"))[*(인)*]]
          )
        ]
      ]
    )

    // 5. [4구역] 기타사항 및 윤독중인간행물 (68.3pt)
    #table(
      columns: (54.1pt, 244.0pt, 151.3pt),
      rows: (26.0pt, 42.3pt),
      align: (center + horizon, left + horizon, center + horizon),
      stroke: (x, y) => (
        top: none,
        left: if x == 0 { none } else { 0.72pt },
        right: none,
        bottom: 1.44pt
      ),
      table.cell(rowspan: 2)[
        #set text(size: 9.8pt, weight: "bold", tracking: 0.1em)
        기타사항
      ],
      table.cell(rowspan: 2, inset: (x: 12pt, y: 8pt), align: left + horizon)[
        #set text(size: 8.8pt)
        #set par(leading: 0.48em)
        
        • 2026년 하반기 독감 무료 예방접종 지정 의료기관 안내문 게시
        #v(4pt)
        • 동절기 에너지 바우처 접수 기간(11.1~12.31) 주민센터 홍보 협조
      ],
      [#text(weight: "bold", size: 9.8pt, tracking: 0.15em)[윤독중인간행물]],
      table.cell(align: left + horizon, inset: (left: 12pt))[
        #set text(size: 8.8pt)
        #set par(leading: 0.48em)
        • 행복 시정소식지 (10월호)\
        #v(3pt)
        • 우리마을 반상회보 제412호
      ]
    )

    // 6. [5구역] 반원 출석 상황 헤더 타이틀 (27.2pt)
    #table(
      columns: (449.4pt),
      rows: (27.2pt),
      align: center + horizon,
      stroke: (x, y) => (
        top: none,
        left: none,
        right: none,
        bottom: 1.44pt
      ),
      [#text(weight: "bold", size: 10.5pt, tracking: 0.6em)[반 원 출 석 상 황]]
    )

    // 7. [6구역] 출석부 명부 헤더 및 15인 출석 데이터 행 (167.0pt)
    #table(
      columns: (117.1pt, 30.7pt, 124.1pt, 26.2pt, 118.4pt, 32.9pt),
      rows: (30.0pt, 27.4pt, 27.1pt, 27.1pt, 27.1pt, 31.3pt),
      align: center + horizon,
      stroke: (x, y) => (
        top: none,
        left: if x == 0 { none } else { 0.72pt },
        right: none,
        bottom: if y == 5 { none } else { 0.72pt }
      ),
      [#text(weight: "bold", size: 9.5pt)[성#h(1.8em)명]], [#text(weight: "bold", size: 9pt)[(인)]],
      [#text(weight: "bold", size: 9.5pt)[성#h(1.8em)명]], [#text(weight: "bold", size: 9pt)[(인)]],
      [#text(weight: "bold", size: 9.5pt)[성#h(1.8em)명]], [#text(weight: "bold", size: 9pt)[(인)]],
      
      // 1행
      [#text(size: 9.2pt)[101호#h(0.5em)김철수]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[102호#h(0.5em)이영희]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[103호#h(0.5em)박상우]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],

      // 2행
      [#text(size: 9.2pt)[201호#h(0.5em)정다은]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[202호#h(0.5em)최현우]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[203호#h(0.5em)강민서]], [#text(size: 7.5pt, fill: rgb("#1d4ed8"))[(서명)]],

      // 3행
      [#text(size: 9.2pt)[301호#h(0.5em)윤재호]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[302호#h(0.5em)조은지]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[303호#h(0.5em)한승민]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],

      // 4행
      [#text(size: 9.2pt)[401호#h(0.5em)송예린]], [#text(size: 7.5pt, fill: rgb("#1d4ed8"))[(서명)]],
      [#text(size: 9.2pt)[402호#h(0.5em)백동현]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[403호#h(0.5em)서유진]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],

      // 5행
      [#text(size: 9.2pt)[501호#h(0.5em)임태양]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[502호#h(0.5em)오세훈]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]],
      [#text(size: 9.2pt)[503호#h(0.5em)배수현]], [#text(size: 8.5pt, fill: rgb("#b91c1c"))[(인)]]
    )
  ]
)
