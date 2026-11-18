# 한국형 서식 서비스의 파일 형식 · 입력란 구조 · 메타데이터 스키마 (예스폼 중심, 공공 서식 표준 참고)

> 조사일: 2026-11-17. 예스폼 상세 페이지 3건(문서서식 2, 엑셀 1)은 HTML 원본을 직접 내려받아(EUC-KR → UTF-8 변환) meta 태그 · JSON-LD · 화면 문구를 확인했다. 서식 본문 내용은 옮기지 않았다.
> 표기: **[직접 확인]** = 이번 조사에서 원문 HTML/문서로 확인, **[미검증]** = 2차 자료 또는 기존 지식이라 원문으로 다시 확인하지 못함.

## 1. 예스폼: 서식별 파일 형식, 웹 편집, 페이지 메타데이터

### Takeaway
예스폼은 서식 하나에 여러 형식을 함께 제공한다(예: 한글 · 워드 · 구글 문서 / 엑셀 · 구글 시트). 상세 페이지 메타데이터는 화면 문구로만 보여 주고, 기계가 읽을 수 있는 서식 스키마는 없다. JSON-LD는 FAQPage · HowTo · WebSite · Organization만 쓰고, 서식 자체를 나타내는 Product/DigitalDocument 유형은 없다. 웹 에디터(editor.yesform.com)도 있지만 일부 문서만 열리고, 입력란을 어떻게 표현하는지는 공개 페이지에서 확인할 수 없었다.

### Cited Findings
**제공 형식**
- 홈 메뉴와 링크에 나오는 형식은 한글(HWP), 워드(DOCX), 엑셀(XLSX/XLSM), 파워포인트(PPTX), PDF, Google Docs · Sheets · Slides · Forms, 노션 링크이다. 카테고리는 서식(회사서류 · 인사/급여 · 생활서류 · 기타), 엑셀, 파워포인트, 기획안/사업계획서, 계약서, 자기소개서, 인사말, 영문서식(별도 서브도메인)으로 나뉜다. — [예스폼 홈](https://www.yesform.com) (WebFetch 결과 일부 글자가 깨져 라벨 일부는 [미검증])
- **[직접 확인]** 취업규칙 서식(vform_192111)의 '사용 가능한 포맷'은 `한글 · 워드 · 구글 문서` 세 가지이다. 아이콘 파일명은 `icon-hwp.svg`, `icon-word.svg`, `icon-gdocs.svg`이다. — [예스폼 표준 취업규칙 상세](https://www.yesform.com/forms/vform_192111.php)
- **[직접 확인]** 이력서 서식(vform_420583)도 `한글 · 워드 · 구글 문서`를 제공한다. — [예스폼 디자인 경력자 이력서 상세](https://www.yesform.com/forms/vform_420583.php)
- **[직접 확인]** 엑셀 서식(excel.yesform.com 100420290)은 `엑셀 · 구글 시트`(`icon-excel.svg`, `icon-gsheet.svg`)를 제공한다. — [예스폼 인사평가 종합 템플릿](https://excel.yesform.com/xls/100420290.html)
- **[직접 확인]** 추천 서식 모달의 다운로드 링크는 `/z_n/forms/dw_form.php?mtbl=form&rowid={id}&type={pptx|xlsx|xlsm}` 형식이고, 각 항목에 `data-format="xlsm"` 같은 속성이 붙는다. 형식은 서식 ID와 확장자 조합으로 따로 내려받는 구조로 보인다. — [예스폼 표준 취업규칙 상세](https://www.yesform.com/forms/vform_192111.php)
- 이번에 본 3개 페이지에서는 HWPX, JPG, PDF 형식 버튼이 보이지 않았다. 홈에는 PDF가 형식으로 나온다. — [예스폼 홈](https://www.yesform.com)

**상세 페이지에 보이는 메타데이터 항목 [직접 확인]** — 출처: [vform_192111](https://www.yesform.com/forms/vform_192111.php), [vform_420583](https://www.yesform.com/forms/vform_420583.php), [excel 100420290](https://excel.yesform.com/xls/100420290.html)
- 제목. 연도 접두어를 붙이는 관행이 있다(예: `[2027년] …`).
- 분류 경로(breadcrumb). 예: `문서서식 > 회사서식 > 인사/HR`
- 태그(키워드 칩). 예: 취업규칙, 근로기준법, 2027년개정 등
- 작성자 블록: 닉네임, 소속 팀(`예스폼 콘텐츠사업팀`, 인증 아이콘), 작성자 목록 링크(`formList.php?maker=…&division=A12B12`, 분류 코드로 보임)
- 이용 등급 배지: `무료 / 유료 / 프리미엄`. 다운로드 권한 함수 인자에 `개인정회원` 또는 `기업정회원`이 들어간다.
- 후기 수, **분량**(`27p`, `1p`, 엑셀은 `3s`로 시트 수 표시), 조회수(예: 153,999)
- `목적 및 용도` 설명. 엑셀은 같은 자리가 `언제 이 엑셀을 쓰면 좋을까요?`로 나온다.
- `사용 가능한 포맷`
- 일부 서식(취업규칙)에만 있는 확장 블록: `핵심 요약`, `상세 스펙`(수정 가능 여부, 관련 법령, 작성·신고 의무), `핵심 특징`, `추천 활용 상황`, `주요 구성 항목`, `작성 단계 가이드`, `작성 팁 및 유의사항`, `주의사항`, `핵심 용어 정리`
- `추천 사용자`(직군 목록), `추천 시즌`(예: 채용·공채 3~4·9~10월), `추천 상황`
- `목차`(조항 제목 목록)
- `본문 내용`: 서식 텍스트를 `div.previewtxt`에 **서식 없는 평문**으로 넣는다. 표 구조나 입력란 표시는 없고, 이력서는 표 셀 텍스트가 반복된 형태로 들어간다.
- 함께 많이 확인한 서식 / 함께 많이 찾는 서식(연관 추천), FAQ

**구조화 데이터 [직접 확인]**
- meta: `description`, `og:title`, `og:type=website`, `og:site_name=예스폼`, `og:url`, `og:description`, `og:image`(썸네일 JPG, `yimgf-thinkzon.yesform.com/docimgs/...`), `fb:app_id`, `link rel=canonical`. 문자셋은 `euc-kr`이다. — [vform_420583](https://www.yesform.com/forms/vform_420583.php)
- JSON-LD는 페이지마다 `FAQPage`(서식별 질문과 답), `WebSite`(SearchAction), `Organization`이 있다. 취업규칙 페이지에는 `HowTo`(작성 단계 4개)도 있다. Product, CreativeWork, DigitalDocument 유형은 없다. — [vform_192111](https://www.yesform.com/forms/vform_192111.php), [excel 100420290](https://excel.yesform.com/xls/100420290.html)
- microdata(`itemprop`)는 Organization의 `url`과 `sameAs`만 있다. — 같은 출처

**웹 편집 모드**
- **[직접 확인]** 상세 페이지에 `예스폼 에디터 OPEN!` 배너와 `바로 편집하기` 버튼이 있다. 배너 문구는 받은 서식을 웹에서 바로 편집하고 예스폼싸인으로 전자계약하라는 안내이다. — [vform_192111](https://www.yesform.com/forms/vform_192111.php)
- **[직접 확인]** 페이지 스크립트는 `https://editor.yesform.com/?from=template&template={EDITOR_DOC_NO}&entry=yesform_detail&title=…` 주소로 에디터를 연다. 에디터로 열 수 있는지는 프록시(`/api/editor/template/template_open_check_proxy.php`)의 `visible: true` 응답으로 정한다. 열 수 없는 문서는 `editor.yesform.com/templates/`로 보낸다. 따라서 **모든 서식이 에디터용으로 변환되어 있지는 않다.** — [vform_192111](https://www.yesform.com/forms/vform_192111.php)
- 에디터 페이지에는 '예스폼 AI'가 있다. 주제나 프롬프트를 넣으면 편집 가능한 문서를 생성하고, `전체 템플릿/MY` 탭, 업종별 인기 템플릿, 다운로드와 인쇄 기능이 있다. 입력란 · 표 셀 · 서명란을 어떻게 표현하는지는 공개 화면에서 확인할 수 없었다. — [예스폼 에디터 템플릿](https://editor.yesform.com/templates/)
- 전자계약 흐름은 `01 계약서 양식 선택 → 02 작성 → 03 전자서명`(예스폼싸인)이다. 사이트에는 온라인 도장/서명 제작 기능(`도장/서명 제작이 완료되었습니다`)도 있다. — [vform_192111](https://www.yesform.com/forms/vform_192111.php)

### Inferences
- 예스폼의 원본은 '원본 파일(HWP/DOCX/XLSX…) + 사람이 읽는 설명 메타데이터'이다. 입력란 수준의 구조화 데이터는 공개 페이지에 없다. 본문 미리보기가 평문이라는 점에서, 웹 에디터용 구조는 별도로 변환해 만드는 것으로 보인다(프록시로 열림 여부를 확인한다는 점이 근거).
- VibeDocStudio가 서식 메타 스키마를 만든다면, 예스폼 화면 항목을 그대로 필드로 옮길 수 있다: `title`, `categoryPath[]`, `tags[]`, `author{name,team,verified}`, `tier(free|paid|premium)`, `pageCount|sheetCount`, `views`, `reviewCount`, `purpose`, `formats[]`, `spec{editable, relatedLaws[], obligation}`, `sections[]/toc[]`, `recommendedUsers[]`, `season`, `faq[]`, `howToSteps[]`.
- SEO용으로는 schema.org `DigitalDocument` 또는 `CreativeWork`에 `encodingFormat`(형식별)을 쓰는 것이 예스폼보다 나은 선택이다. 예스폼이 쓰는 것은 FAQPage와 HowTo뿐이다.

### Gaps
- 예스폼 에디터에서 입력란 · 표 셀 · 서명란을 어떻게 표현하는지(필드 이름, 타입)는 로그인과 에디터 내부 화면이 필요해 확인하지 못했다.
- HWPX · PDF · JPG를 서식 단위로 제공하는지는 3개 페이지에서 보이지 않았다. 다른 서식(예: 법정 서식류)에는 있을 수 있다. 미확인.
- 받은 HWP 파일 안에 누름틀을 쓰는지도 파일을 열어 보지 않아 확인하지 못했다.

## 2. HWPX/OWPML에서 서식 관련 요소가 표현되는 방식

### Takeaway
한글 문서는 입력란을 **필드(FIELDBEGIN/FIELDEND 쌍, 누름틀=ClickHere)와 이름**으로, 표 셀을 **셀 주소 · 병합 수 · 셀 필드 이름 · 제목 셀 · 보호/편집 속성**으로 표현한다. 데이터를 채울 때는 필드 이름(누름틀 이름 또는 셀 이름)을 키로 쓴다. 양식 개체(입력 상자, 체크 상자, 라디오, 콤보 등)도 따로 있다.

### Cited Findings
- HWPX는 OWPML(KS X 6101) 표준을 따르는 ZIP 기반 XML 컨테이너이다. — [canine89 hwpx skill](https://skills.sh/canine89/hwpxskill/hwpx)
- 본문 XML은 `Contents/section0.xml`에 있다(구역이 여러 개면 section1… [미검증]). — [WikiDocs HWPX 글 (검색 요약)](https://wikidocs.net/393350)
- **필드 시작 FIELDBEGIN**의 속성은 `Type`(필드 종류), `Name`(필드 이름), `InstId`(문서 안에서 고유한 인스턴스 ID), `Editable`(읽기 전용 상태에서도 수정 가능, 기본 true), `Dirty`(내용 수정 여부), `Property`, `Command`(필드 종류별 고유 정보)이다. FIELDEND는 `Type`, `Editable`, `Property`를 가진다. — [한컴 HWPML 3.0 rev1.2 명세 PDF](https://cdn.hancom.com/link/docs/한글문서파일형식3.0_HWPML_revision1.2.pdf) (표 161 · 162) **[직접 확인]**
- **FieldType 열거값**: Clickhere(누름틀), Hyperlink, Bookmark(블록 책갈피), Formula(표 계산식), Summery(문서요약), UserInfo, Date, DocDate, Path, Crossref(상호참조), **Mailmerge(메일머지)**, Memo, 그리고 교정부호용 Revision* 계열. — 같은 명세 **[직접 확인]**
- **표 TABLE**의 속성은 `PageBreak`(Table|Cell|None), `RepeatHeader`(제목 행 반복), `RowCount`, `ColCount`, `CellSpacing`, `BorderFill`이다. 자식으로 `CELLZONELIST/CELLZONE`(Start/End Row·Col 주소별 테두리/배경 영역)과 `ROW`를 가진다. — 같은 명세 (표 102 · 110 · 111) **[직접 확인]**
- **셀 CELL**의 속성은 `Name`(**셀 필드 이름**), `ColAddr`/`RowAddr`(0부터 시작하는 셀 주소), `ColSpan`/`RowSpan`(병합 수), `Width`/`Height`, `Header`(제목 셀 여부), `HasMargin`, `Protect`(사용자 편집 금지), `Editable`, `Dirty`, `BorderFill`이다. 자식은 `CELLMARGIN`, `PARALIST`이다. 셀 안에 다시 표를 넣으면 '표 안의 표'가 된다. 표는 문단 안의 개체이므로 PARALIST 안에 들어갈 수 있다. — 같은 명세 (표 113) **[직접 확인]**. 중첩 가능 여부는 구조에서 추론한 것이다.
- 명세 목차에 '테이블 확장(셀 필드 이름) 정보'와 '누름틀 필드 이름 정보'가 별도 블록으로 있다. 셀 이름과 누름틀 이름이 필드 이름 체계의 두 축이라는 뜻이다. — 같은 명세 목차(8.7, 8.8) **[직접 확인]**
- **양식 개체 FORMOBJECT**(BUTTON, RADIOBUTTON, CHECKBUTTON, COMBOBOX, EDIT, LISTBOX, SCROLLBAR 공통)의 속성은 `Name`, `ForeColor`, `BackColor`, `GroupName`, `TabStop`, `TabOrder`, `Enabled`, `BorderType`, `DrawFrame`, `Printable`이다. EDIT에는 `MultiLine`, `PasswordChar`, `MaxLength`, `ScrollBars`, `Number`, `ReadOnly`, `AlignText` 등이 있다. — 같은 명세 (표 143 · 150) **[직접 확인]**
- STYLE의 `LockForm`은 '양식 모드에서 스타일 보호' 속성이다. 한글에는 입력 가능한 곳만 열어 두는 '양식 모드'가 있다. — 같은 명세 (표 63) **[직접 확인]**
- OWPML(HWPX)에서는 셀이 `<hp:tc borderFillIDRef="…">`이고, 주소는 `<hp:cellAddr colAddr="0" rowAddr="0"/>`, 병합은 `<hp:cellSpan colSpan="1" rowSpan="1"/>`로 표현한다. cellAddr는 셀 내용 뒤에 온다는 설명도 있다. — [mulerun hwpx 스킬 문서](https://mulerun.com/skillshub/@iamseungpil/claude-for-dslab~hwpx:20260203231443/llm.txt)
- HWPX 자동화 예제는 `<hp:fieldBegin … name="{필드명}" …/>`를 정규식으로 찾아 값을 채운다. 즉 OWPML에서도 필드 이름은 `fieldBegin`의 `name` 속성에 들어간다. — [Hugging Face boxlabel app.py (검색 스니펫)](https://huggingface.co/spaces/dohyune/boxlabel/blob/main/app.py)
- 한글 자동화(pyhwpx/HwpCtrl)에서는 `PutFieldText`처럼 필드 이름으로 값을 넣는 방식이 쓰인다. — [인프런 질의 'putfieldtext 함수 사용'](https://www.inflearn.com/en/community/questions/1048919/putfieldtext-%ED%95%A8%EC%88%98-%EC%82%AC%EC%9A%A9-%EA%B4%80%EB%A0%A8-%EC%A7%88%EB%AC%B8) (검색 결과 제목 수준, 본문 [미검증])

### Inferences
- OWPML에서 누름틀은 `hp:fieldBegin type="CLICK_HERE" name="…"`이고, 안내문은 parameters 안의 `Direction` 같은 문자열 파라미터로 저장된다고 알려져 있다. 그러나 **이번 조사에서 OWPML 원문으로 확인하지 못했다 [미검증]**. HWPML의 `Type=Clickhere`와 같은 개념으로 보면 된다.
- 블록/슬롯 모델에 그대로 대응시킬 수 있다. 누름틀은 인라인 slot(`kind: "clickHere"`, `name`, `guide`(안내문), `editable`), 셀 이름은 셀 단위 slot(`cellName`), 양식 개체는 control slot(`checkbox`, `radio(groupName)`, `combo(options)`, `edit(maxLength, number, multiLine)`)으로 둔다. 셀의 `Protect`/`Editable`은 '고정 라벨 셀'과 '입력 셀'을 구분하는 근거로 쓸 수 있다.
- 메일 머지와 일괄 채우기는 '필드 이름 = 데이터 키' 규약으로 이루어진다. 따라서 스키마의 slot `name`은 문서 안에서 안정적이어야 하고 사람이 읽을 수 있어야 한다(예: `신청인.성명`).

### Gaps
- 한컴 OWPML 공식 명세(KS X 6101)에서 `hp:fieldBegin`의 정확한 속성(`type`, `name`, `editable`, `dirty`, `zorder`, `fieldid`)과 parameters 이름은 원문으로 확인하지 못했다. 한글로 누름틀을 넣어 HWPX로 저장한 뒤 `section0.xml`을 직접 열어 보는 것이 가장 확실하다.
- `hp:tc`의 `name`, `header`, `protect`, `editable` 속성이 HWPML의 CELL 속성과 1:1로 대응하는지도 원문으로 확인하지 못했다(대응할 가능성이 높다는 것은 추론).

## 3. 한국 법정 서식 관행과 공공 서식 메타데이터 API

### Takeaway
법제처 국가법령정보 공동활용 API는 '별표서식 목록 조회'(target=licbyl)를 제공한다. 응답 필드는 별표명, 별표번호, 별표종류(별표/서식/별지/별도/부록), 관련법령명, 소관부처명, 공포일자, 제개정구분, 법령종류, 그리고 **파일링크(HWP)와 PDF 링크**이다. 서식 양식에는 '별지 제N호서식', 처리기간, '색상이 어두운 칸은 신청인이 적지 않습니다' 같은 관행이 반복된다.

### Cited Findings
- **[직접 확인] 법령 별표서식 목록 API**: 요청 URL은 `http://www.law.go.kr/DRF/lawSearch.do?target=licbyl`이다. 요청 변수는 `OC`(인증), `type`(HTML/XML/JSON), `search`(1 별표서식명, 2 해당법령, 3 별표본문), `query`, `display`(최대 100), `page`, `sort`(lasc/ldes), `org`(소관부처코드, 쉼표로 여러 개), `mulOrg`(OR/AND), `knd`(**1 별표, 2 서식, 3 별지, 4 별도, 5 부록**), `gana`(가나다 사전식), `popYn`이다. — [open.law.go.kr 별표서식 목록 조회 API 가이드](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsBylListGuide)
- **[직접 확인] 응답 필드**: `totalCnt`, `licbyl id`, `별표일련번호`, `관련법령일련번호`, `관련법령ID`, `별표명`, `관련법령명`, `별표번호`, `별표종류`, `소관부처명`, `공포일자`, `공포번호`, `제개정구분명`, `법령종류`, `별표서식파일링크`, `별표서식PDF파일링크`, `별표법령상세링크`. — 같은 출처
- **[직접 확인]** 같은 계열 API로 행정규칙 별표서식(`admrulBylListGuide`)과 자치법규 별표서식(`ordinBylListGuide`) 목록 API, 모바일판도 있다. — [open.law.go.kr OPEN API 활용가이드 목록](https://open.law.go.kr/LSO/openApi/guideList.do)
- 샘플 키(`OC=test`)로 호출하면 '사용자 정보 검증 실패'가 나온다. 서버 IP와 도메인을 등록한 인증키가 필요하다. — 직접 호출 결과 (`law.go.kr/DRF/lawSearch.do`)
- 국가법령정보센터 웹의 별표/서식 검색 결과 화면은 [서식명], [법령명], [별표·서식내용] 항목을 보여 준다. — [law.go.kr 도움말](https://law.go.kr/html_new/HelpN8.html) (검색 스니펫)
- 법정 서식 관행: 서식 머리에 근거 법령과 '별지 제N호서식'(예: `별지 제1호의2서식`)을 적는다. 상단 표에 `접수번호 · 접수일 · 처리기간`(예: '즉시', '90일')을 두고, `※ 색상이 어두운 칸은 신청인이 적지 않습니다` 같은 안내로 **행정기관이 적는 칸을 음영으로 구분**한다. 표현은 서식마다 '칸/란/난'으로 조금씩 다르다. — [국가인권위 정보공개 청구서(별지 제1호의2서식) PDF](https://www.humanrights.go.kr/template/resources/file/[별지%20제1호의2서식]%20정보공개%20청구서.pdf), [opinion.lawmaking.go.kr 첨부 서식](https://opinion.lawmaking.go.kr/file/download/8444248/6GM5ZQD0ERDNRTCZ0C9B) (둘 다 검색 스니펫 기반, 개별 서식의 처리기간 값은 스니펫에 나온 그대로)

### Inferences
- 공공 서식 메타는 법제처 API 필드를 그대로 쓰는 것이 표준에 가장 가깝다: `formName(별표명)`, `formNo(별표번호, '제1호의2' 같은 가지번호 포함)`, `formKind(별표|서식|별지|별도|부록)`, `law{name,id,serial,kind}`, `ministry(소관부처명/코드)`, `promulgation{date,no}`, `revisionType(제개정구분)`, `files{hwp,pdf}`, `detailUrl`.
- 법정 서식 레이아웃 관행은 slot 메타 플래그로 옮길 수 있다: `filledBy: "applicant" | "agency"`(음영 칸은 agency), 머리 영역 `receipt{접수번호, 접수일, 처리기간}`, 꼬리 영역 `signature{신청인 (서명 또는 인), 날짜}`, 수신 기관장 표기, `attachments[](구비서류)`, `fee(수수료)`. 결재란은 열 단위 반복 slot(`approvalLine[]{role, signer, date}`)으로, 세로 머리글은 셀의 `textDirection: vertical`과 `header: true`로 표현할 수 있다.

### Gaps
- 정부24 서식 목록과 공공데이터포털에서 '서식 메타데이터' 전용 데이터셋의 필드는 확인하지 못했다(도구 호출 한도 때문에 미조사).
- 법정 서식 작성 기준을 정한 공식 지침(예: 법제처 '법령 서식 작성 기준', 행정안전부 행정업무운영 편람의 결재란 규정)의 원문은 확인하지 못했다. 결재란은 법정 서식보다 기관 내부 문서(기안문) 관행이라는 점도 원문 확인이 필요하다 [미검증].
- API의 `별표서식파일링크`가 HWP인지 HWPX인지(최근 법제처가 HWPX를 제공하는지)는 인증키 없이 확인할 수 없었다.

## 4. 채울 수 있는 필드를 가진 템플릿의 공개 스키마 비교

### Takeaway
세 형식 모두 '이름 + 타입 + 값 + (표시용 별칭/안내문)'이라는 같은 골격을 가진다. DOCX는 `w:sdt`의 `tag`/`alias`, PDF는 AcroForm 필드의 `/T`/`/FT`, HWP는 필드 `Name`/`Type`(+셀 `Name`)에 이 정보를 저장한다.

### Cited Findings
- **DOCX 콘텐츠 컨트롤(SDT)**: `w:sdt > w:sdtPr`에 `alias`(사람이 보는 이름), `tag`(기계용 태그), `id`, lock, placeholder, dataBinding(사용자 정의 XML 파트와 XPath 바인딩), 그리고 타입 요소 하나(`text`, `richText`, `date`, `dropDownList`, `comboBox`, `picture`, `docPartObj/List`, `group`, `citation`, `bibliography`, `equation`, Office 2010+ `checkbox`, Office 2013+ `repeatingSection/Item`)를 둔다. 예: `<w:alias w:val="Birthday"/><w:id …/><w:date>…`. — [Microsoft Learn: SdtProperties](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtproperties) **[직접 확인]**
- **HWP 필드**: `FIELDBEGIN Type=Clickhere|Mailmerge|… Name=… Editable Dirty Command`, 셀 `Name`, 양식 개체 `FORMOBJECT Name/GroupName`. — [한컴 HWPML 3.0 명세](https://cdn.hancom.com/link/docs/한글문서파일형식3.0_HWPML_revision1.2.pdf) **[직접 확인]**
- **PDF AcroForm**: 문서 카탈로그의 `/AcroForm` 사전에 `/Fields` 배열이 있다. 각 필드 사전은 `/FT`(Tx 텍스트 · Btn 버튼/체크/라디오 · Ch 선택 · Sig 서명), `/T`(부분 이름, 부모와 점으로 이어 완전한 이름이 됨), `/TU`(사용자용 이름), `/V`(값), `/Ff`(플래그: 필수, 읽기 전용, 여러 줄 등)를 가지고, 화면 표시는 Widget 주석이 맡는다. — [ISO 32000-1 (PDF 1.7) Adobe 공개본](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf) **[미검증: 이번 조사에서 원문 열람 실패(429), 기존 지식 기반]**

### Inferences
- 공통 slot 필드 정의 제안(JSON):
  `{ id, name(기계 키, 머지용), label(alias/TU), type: text|multiline|number|date|checkbox|radio|select|signature|seal|image|table-row-repeat, required, readOnly/locked, filledBy: applicant|agency|approver, guide(누름틀 안내문/placeholder), format(날짜·주민번호 마스크), options[], groupName, maxLength, binding(데이터 경로 예: 신청인.성명), source: {hwp: fieldName|cellName, docx: sdtTag, pdf: fullyQualifiedName} }`
- 내보낼 때의 매핑 규칙: slot.name을 HWPX `fieldBegin@name`(누름틀) 또는 `tc@name`(셀), DOCX `w:tag`, PDF `/T`로 쓴다. slot.label은 DOCX `w:alias`와 PDF `/TU`로 쓴다. slot.guide는 누름틀 안내문과 SDT placeholder로 쓴다. 서명/날인(서명란)은 PDF `Sig`에만 표준 타입이 있으므로, HWP/DOCX에서는 이미지 slot이나 텍스트 '(서명 또는 인)' 앵커로 대체해야 한다.
- 서식 단위 메타 스키마는 '예스폼식 상품 메타'(title, tags, tier, formats[], pageCount, purpose, toc, faq)와 '법제처식 법정 메타'(formKind, formNo, law, ministry, promulgation, files)를 합치는 형태가 적합하다. 법정 서식이면 `legal` 하위 객체를 채운다.

### Gaps
- PDF AcroForm 키는 이번 조사에서 원문을 다시 확인하지 못했다(사이트 요청 제한). 보고서에 쓰기 전에 ISO 32000 12.7절을 확인하는 것을 권장한다.
- 한컴 웹기안기/한컴오피스 웹에서 누름틀을 어떻게 다루는지(HWPX 웹 편집기 API)는 조사 범위 밖이었다.
