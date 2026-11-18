# 코드 트리로 분류하고 AI로 빈틈 메우는 예스폼

예스폼은 서식을 `A11B11C17`처럼 **두 자리씩 이어 붙인 3단 문자열 경로 코드**로 분류한다. A는 서비스(서브도메인)별 대분류(A11 문서서식 ~ A17 인사말), B는 중분류, C는 소분류다. 그 위에 포맷·업종·언어·정렬 같은 직교 패싯, 사용자(39개)·시즌(48개)·상황(대분류 9개) 3축 큐레이션, 자유 키워드 태그를 겹쳐서 서식 하나를 트리 한 곳과 여러 축에 동시에 연결한다. 저장·제공 단위는 **형식별 원본 파일(한글·워드·구글 문서 등, 형식마다 따로 내려받음)과 사람이 읽는 상세 페이지 설명**이다. 칸(입력란) 수준의 구조화 데이터는 공개되지 않고, JSON-LD도 서식 자체가 아니라 FAQPage·HowTo만 다룬다. AI는 2026년에 나온 '예스폼 에디터' 안의 '예스폼 AI'가 중심이다. 이 기능은 "전문가 서식이 있으면 그걸 웹에서 직접 고치고, 없으면 주제·프롬프트로 초안을 생성"하는 구조다. OpenAI 기반이며, 기존 서식의 빈칸을 AI가 채워 준다는 증거는 없다. 비즈폼, 한컴독스 AI·한컴어시스턴트, 모두싸인도 모두 "자유 생성 초안 + 사후 편집"이 기본이다. 칸에 근거·출처를 다는 기능은 어느 곳도 언급하지 않는다. 그러므로 VibeDocStudio의 자리는 **"구조를 먼저 고정하고, 타입이 있는 슬롯 단위로 채우고, 칸마다 근거를 붙이는"** 흐름이다. 가져다 쓸 것은 네 가지다. 트리+직교 패싯+역할·시즌·상황 큐레이션, 예스폼식 상품 메타와 법제처식 법정 메타를 합친 서식 스키마, HWPX 누름틀/셀 이름·DOCX 콘텐츠 컨트롤·AcroForm 필드를 하나의 키로 묶는 슬롯 스키마, 그리고 "템플릿 우선, 생성은 대체 경로" 흐름이다. 이 보고서에 나오는 서식 건수(문서서식 약 8만 건 등)는 목록 페이지 수에 50을 곱한 **상한 추정치**이고, 일부 화면 라벨은 EUC-KR 페이지를 판독하다 생긴 **추정**이다. 해당 항목은 본문과 마지막 표에 표시했다.

> 표기 규칙: 〔추정〕은 수치·구조에서 추론한 값, 〔판독 추정〕은 EUC-KR 글자 깨짐 때문에 라벨을 짐작해 읽은 값, 〔미검증〕은 원문으로 다시 확인하지 못한 2차 자료나 기존 지식이다. 서식 본문은 옮기지 않았고, 분류명·코드·필드명·흐름만 요약했다.

## A·B·C 세 단계 코드 위에 패싯과 3축 큐레이션이 겹친다

예스폼 분류의 뼈대는 **대분류 7개(A11~A17)가 각각 서브도메인 하나에 대응하는 트리**다. 문서서식 A11(www), 엑셀 A12(excel), 파워포인트 A13(powerpoint), 사업계획서 A14(plan), 계약서 A15(contract), 자기소개서 A16(resume), 인사말 A17(speech)이 있다. 영문서식(english.yesform.com, `language=en`)은 새 코드를 만들지 않고 같은 코드를 다시 쓴다. 각 단계 번호는 11부터 시작하며, D단계는 관찰되지 않았다. 상세 페이지 breadcrumb도 "문서서식 > 회사서식 > 총무/기타"처럼 이 3단계를 그대로 보여 준다 ([예스폼 홈](https://www.yesform.com/), [문서서식 메인](https://www.yesform.com/docs/formMain.php), [상세 예시](https://www.yesform.com/forms/vform_100577.php)).

주목할 점은 **소분류의 기준이 중분류마다 다르다**는 것이다. 회사서식(A11B11)과 엑셀은 직무(C11 기획/전략, C12 인사/HR, C13 재무/회계, C14 영업/마케팅, C15 구매/자재/생산, C16 총무/기타, 회사서식에만 C17 ISO 표준서식)로 나눈다. PPT 템플릿은 산업, 인포그래픽은 도식 모양(조직도형·프로세스형·SWOT형 등 10종), 계약서는 거래 유형(물품/서비스, 지식/기술, 금전/금융, 부동산, 고용/인사, 건설/공사 등 8종), 스피치는 감정·목적(축하·격려·감사·이별 등)으로 나눈다. 사업계획서의 "목차별 슬라이드"(A14B12)는 표지·목차·요약·시장 분석·재무 계획처럼 **문서 안의 섹션 단위**로 나눈다. 반대로 법률(A11B12)·생활(A11B13)·교육행정(A11B14) 서식에는 소분류가 아예 없다. 그 대신 목록 위에 "고소장·내용증명·탄원서", "가정통신문·출석부" 같은 문서 종류 키워드 칩을 늘어놓는다 ([A11B11](https://www.yesform.com/docs/formList.php?division=A11B11), [A11B12](https://www.yesform.com/docs/formList.php?division=A11B12), [A13B12](https://powerpoint.yesform.com/docs/formList.php?division=A13B12), [A14B12](https://plan.yesform.com/docs/formList.php?division=A14B12), [A15B11](https://contract.yesform.com/docs/formList.php?division=A15B11)). 하나의 공통 축을 강제하지 않고 중분류마다 가장 자연스러운 축을 고른 실용적 설계다. 흔히 예시로 드는 "인사/총무/회계/계약/공문/학교"가 한 층에 나란히 있는 구조는 실제로 없다. 이 이름들은 여러 층과 여러 대분류에 흩어져 있고, "공문"이라는 분류명은 메뉴에서 찾지 못했다.

트리 밖의 탐색은 **하나의 GET 폼(`detailFrm`)이 모든 패싯을 조합**하는 방식이다. `division`은 트리 경로, `menu=freeData`는 무료 서식 컬렉션이고, 나머지는 hidden 필드 20여 개(`aFormat, Upjong, Type, aColor, Gubun, aUse, aStyle, free, sort, scale, mode` 등)로 넘긴다. 패싯 값도 트리와 같은 문법을 쓰지만 접두가 Z다. 예를 들어 업종은 `Z11B11` 제조/생산 ~ `Z11B18` 기타, 엑셀 속성은 `Z12B11` 일반 / `Z12B12` 매크로다 ([A11B11](https://www.yesform.com/docs/formList.php?division=A11B11), [A12B12](https://excel.yesform.com/docs/formList.php?division=A12B12)).

| 패싯 | 파라미터 | 값 (관찰된 것) | 적용 범위 |
|---|---|---|---|
| 포맷 | `Format`/`aFormat` | 1 한글 · 2 워드 · 4 파워포인트 · 5 PDF · 6 엑셀 · 7 노션 · 18 구글 닥스 · 19 구글 시트 · 20 구글 슬라이드 · 100 기타 (복수 선택) | 공통 |
| 업종 | `Upjong` | Z11B11~Z11B18 (8개) | 공통 |
| 언어 / 정렬 / 보기 / 개수 | `language` / `SORT` / `MODE` / `SCALE` | kr·en / Date·view(다운로드순)·match·RANK / ALBUM·IMGS·LIST / 10·30·50·100 | 공통 |
| 등급 | `free` | 무료 · 유료 · 프리미엄 | 공통(PPT에서 노출) |
| 용도 | `Use` | PPT: 회사소개서·피치덱 등 Z13B11~17, 사업계획서: 창업·투자제안·정책지원사업 등 Z13B18~22 | PPT·사업계획서 |
| 스타일 / 비율 / 색상 | `Style` / `Gubun` / `Color` | 포토·일러스트·심플/모던·3D / 16:9·4:3·A4 세로 / 12색 | PPT |

출처: [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11), [A13B11](https://powerpoint.yesform.com/docs/formList.php?division=A13B11), [A14B11](https://plan.yesform.com/docs/formList.php?division=A14B11)

패싯 위에 다시 **"맞춤 서식 큐레이션" 3축**이 있다. "누가"에 해당하는 사용자 축(`ReUsers`)은 경영진·인사 담당자·노무사·취업 준비생 등 39개 역할이다. "언제"에 해당하는 시즌 축(`ReSeason`)은 48개이고 세 유형으로 나뉜다. type1은 계절·생활 이벤트, type2는 설·추석·부가세 신고·연말정산 같은 세무·신고 일정, type3은 최저임금 인상·노동법 개정 같은 법·제도 변경이다. "왜"에 해당하는 상황 축은 대분류 9개 → 중분류 → "사업계획을 수립할 때"식 상황 문구로 이어지는 3단계 마법사다 ([큐레이션](https://www.yesform.com/curation/)). 상세 페이지의 "추천 사용자·추천 시즌·추천 상황" 블록이 이 축들에 링크된다. 서식마다 붙는 자유 키워드 태그는 `search.php?q=` 검색으로 연결된다. 설계상 결함도 하나 보인다. **같은 코드 `Z11B11`이 업종 필터에서는 "제조/생산", 큐레이션에서는 "경영진·관리자"를 뜻한다** ([상세](https://www.yesform.com/forms/vform_100577.php)). 패싯 사전에 네임스페이스가 없다는 증거이고, 따라 하면 안 될 부분이다. 목록은 50페이지까지만 넘길 수 있고, 그 뒤는 필터를 쓰라고 경고한다. 탐색을 깊은 페이지 넘김이 아니라 패싯으로 유도하는 장치다.

규모에 대해서는 사이트가 "100만 서식", "국내 1위"를 내세운다. 목록 JS의 `Total`(주석상 "총 페이지수")에 기본 쪽당 50건을 곱하면 문서서식 A11은 1,595쪽으로 **약 7.98만 건〔추정, 상한〕**, 그중 회사서식 약 5.05만, 무료 서식 약 1.9만 건이다. 중분류 네 개의 페이지 합(1,597)이 A11 전체(1,595)와 거의 같아서 트리가 합산 구조라는 점은 뒷받침된다. 전 대분류를 합쳐도 약 25만 건 수준이므로〔추정〕, "100만"은 연도별 개정판·제휴 콘텐츠 등을 합친 마케팅 수치로 보인다〔추정〕 ([A11](https://www.yesform.com/docs/formList.php?division=A11), [A11B11](https://www.yesform.com/docs/formList.php?division=A11B11)). 외부 자료도 시점에 따라 다르다. 2024년 기사는 약 55만 종 ([파이낸스투데이](https://www.fntoday.co.kr/news/articleView.html?idxno=314353)), 나무위키는 유료 포함 약 50만 종(시점 불명) ([나무위키](https://namu.wiki/w/%EC%98%88%EC%8A%A4%ED%8F%BC))이라고 한다. 정확한 총 건수는 어디에도 표시되지 않는다.

## 서식은 "원본 파일 + 사람이 읽는 설명"이고 칸 구조는 공개되지 않는다

예스폼의 저장 단위는 **서식 한 건에 여러 원본 형식을 붙인 묶음**이다. 취업규칙 서식과 이력서 서식은 `한글 · 워드 · 구글 문서` 세 가지를, 엑셀 서식은 `엑셀 · 구글 시트`를 제공한다. 다운로드 링크는 `/z_n/forms/dw_form.php?mtbl=form&rowid={id}&type={pptx|xlsx|xlsm}` 형식이라, 서식 ID와 확장자를 조합해 형식마다 따로 받는다 ([취업규칙 상세](https://www.yesform.com/forms/vform_192111.php), [이력서 상세](https://www.yesform.com/forms/vform_420583.php), [엑셀 상세](https://excel.yesform.com/xls/100420290.html)). 확인한 세 페이지에서는 HWPX 버튼이 보이지 않았다. 받은 HWP 안에서 누름틀을 쓰는지도 파일을 열어 보지 않아 확인하지 못했다〔미검증〕.

상세 페이지 메타데이터는 화면 문구로만 존재한다. 공통 항목은 제목(`[2027년] …`처럼 연도를 앞에 붙이는 관행), breadcrumb, 키워드 태그, 작성자 블록(닉네임, 소속 팀과 인증 아이콘, `formList.php?maker=…` 링크), 이용 등급(무료/유료/프리미엄), 후기 수다. 여기에 **분량**(문서는 `27p`, 엑셀은 `3s`처럼 시트 수), 조회수, "목적 및 용도"(엑셀은 "언제 이 엑셀을 쓰면 좋을까요?"), "사용 가능한 포맷", 추천 사용자·시즌·상황, 목차, FAQ, 연관 서식, 이용후기가 붙는다. 취업규칙처럼 일부 서식에는 "상세 스펙"(수정 가능 여부, 관련 법령, 작성·신고 의무), "주요 구성 항목", "작성 단계 가이드", "핵심 용어 정리" 같은 확장 블록도 있다. 반대로 **파일 크기, 등록일·수정일, 단건 가격은 상세 화면에서 보이지 않았다** ([vform_192111](https://www.yesform.com/forms/vform_192111.php), [vform_100577](https://www.yesform.com/forms/vform_100577.php), [vform_107621](https://www.yesform.com/forms/vform_107621.php)). "본문 내용" 미리보기는 `div.previewtxt` 안의 **서식 없는 평문**이다. 표 구조나 입력란 표시가 없고, 이력서는 표 셀 텍스트가 줄줄이 반복된 형태로 들어간다 ([vform_420583](https://www.yesform.com/forms/vform_420583.php)). 검색용 텍스트 색인이지 구조 데이터가 아니다.

기계가 읽는 층은 얇다. `og:*` 메타(썸네일 JPG), canonical, 문자셋 `euc-kr`이 있다. JSON-LD는 **FAQPage·WebSite(SearchAction)·Organization, 일부 페이지의 HowTo(작성 단계 4개)**뿐이고 Product·CreativeWork·DigitalDocument 유형은 없다 ([vform_192111](https://www.yesform.com/forms/vform_192111.php), [엑셀 상세](https://excel.yesform.com/xls/100420290.html)). 상세 HTML에는 "AI 생성 안내 (샘플 데이터)"라는 주석만 있는 빈 블록 자리도 있다. 서식별 AI 안내를 붙일 계획의 흔적으로 보인다〔추정〕 ([상세](https://www.yesform.com/forms/vform_100577.php)).

웹 편집은 별도 경로다. 상세 페이지 스크립트는 프록시(`/api/editor/template/template_open_check_proxy.php`)에 열 수 있는지 묻고, `visible: true`일 때만 `editor.yesform.com/?from=template&template={EDITOR_DOC_NO}`로 연다. 열 수 없으면 템플릿 목록으로 보낸다 ([vform_192111](https://www.yesform.com/forms/vform_192111.php)). 즉 **에디터용 문서는 원본 서식과 다른 번호 공간에서 따로 변환해 관리**하며, 2026년 10월 기준 웹 편집 가능 서식은 "1만 종 이상"으로 전체의 일부다 ([넥스트데일리](https://www.nextdaily.co.kr/news/articleView.html?idxno=254199)). 에디터의 문서 모델은 굵게·목록·표·이미지를 갖춘 **워드형 리치텍스트 본문과 표**다. 빈칸 채우기, 표 행·열 추가, 칸 너비 조절, 로고·직인 이미지 배치가 핵심 편집 기능이다. 이름과 타입이 있는 입력 필드가 있다는 흔적은 공개 화면에서 보이지 않았다. 다만 에디터 내부는 로그인이 필요해 확인하지 못했다〔미검증〕 ([예스폼 에디터 템플릿](https://editor.yesform.com/templates/)). 에디터 결과물을 어떤 형식으로 내려받는지도 공식 자료에 없다. 전자계약으로 넘길 때만 서명용 PDF로 바뀐다는 점이 확인된다 ([넥스트데일리](https://www.nextdaily.co.kr/news/articleView.html?idxno=254199)).

## 예스폼 AI는 "전문가 서식 우선, 없으면 생성 초안"이다

예스폼 AI는 세 갈래로 나뉜다. 2024년 2월에는 서식 상세 페이지에 ChatGPT 문구 추천과 폴라리스 웹오피스 편집을 붙였다. 막힌 문구를 묻는 보조 방식이었다 ([예스폼 공지](https://www.yesformcorp.com/Notice/?bmode=view&idx=18101741)). 2026년에는 **자체 '예스폼 에디터'와 그 안의 '예스폼 AI'**가 나왔다. 2026-06-10 블로그는 프롬프트나 문서 주제만 넣으면 AI가 본문 초안을 채우고 같은 화면에서 "워드처럼" 고친다고 설명한다 ([예스폼 블로그](https://blog.yesform.com/entry/%EC%98%88%EC%8A%A4%ED%8F%BC-%EC%97%90%EB%94%94%ED%84%B0%EB%A1%9C-%EB%AC%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EC%8B%9C%EA%B0%84%EC%9D%84-%EC%A0%88%EB%B0%98%EC%9C%BC%EB%A1%9C-%EC%A4%84%EC%9D%B4%EC%84%B8%EC%9A%94-ft-AI)). 세 번째는 speech.yesform.com의 **AI 스피치·AI 인사말** 같은 설문형 생성기다. 행사 종류·대상·어조·분량(1분 이하/5분 이하/10분 이상)·키워드·언어(한국어 외 13개)를 고르면 연설문을 만들고, 결과는 재생성·복사·카카오 공유·인쇄할 수 있다 ([AI 스피치](https://speech.yesform.com/docs/ai_speech_view.php), [AI 인사말](https://speech.yesform.com/docs/ai_greeting_view.php)). 2024년의 외부 웹오피스에서 2026년 자체 편집기로 넘어간 것은 시기상 그렇게 보일 뿐 공식 발표는 없다〔추정〕. 별도 상품인 "AI 계약서 검토"나 "자소서 전용 AI"는 찾지 못했다.

동작 방식은 두 모드다. 첫째는 **기존 서식을 웹에서 열어 사람이 빈칸을 직접 채우는 방식**이다. 기사는 전문가 서식에 항목과 조항이 이미 들어 있어 초보자도 완성하기 쉽다고 강조한다. 둘째는 **맞는 서식이 없을 때 조건을 넣어 초안을 생성하는 방식**이다. 예를 들어 계약 금액·납품 기한·필요한 조항을 입력하면 표와 서명란을 갖춘 계약서 초안이 나온다 ([넥스트데일리](https://www.nextdaily.co.kr/news/articleView.html?idxno=254199)). 에디터 일반 문서의 입력은 주제나 프롬프트 한 줄이다. 분야·업종·문서 형식·경력 수준을 미리 정해 두면 맞춤 프롬프트를 추천한다 ([예스폼 에디터](https://editor.yesform.com/), [예스폼 블로그](https://blog.yesform.com/entry/%EC%98%88%EC%8A%A4%ED%8F%BC-%EC%97%90%EB%94%94%ED%84%B0%EB%A1%9C-%EB%AC%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EC%8B%9C%EA%B0%84%EC%9D%84-%EC%A0%88%EB%B0%98%EC%9C%BC%EB%A1%9C-%EC%A4%84%EC%9D%B4%EC%84%B8%EC%9A%94-ft-AI)). 계약서처럼 정형인 문서는 "핵심 변수 → 구조 생성", 일반 문서는 "자유 프롬프트 → 본문 생성"이라는 차이가 있다. **AI가 기존 서식의 빈칸을 사용자 정보로 자동으로 채우는 기능은 증거가 없고**, 선택 영역 다시쓰기·요약 같은 인라인 편집도 확인되지 않았다. 번역·문법 교정 지원은 검색 요약에만 나와서 〔미검증〕이다.

사용자 흐름은 두 진입로로 정리된다. 서식 기반 경로는 상세 페이지 → "바로 편집하기" → 웹에서 빈칸·표 편집 → 다운로드·인쇄, 또는 계약서라면 "전자계약 바로 시작하기"로 이어진다. 전자계약으로 가면 서명용 PDF 변환 → 예스폼싸인(2026-04 베타)으로 넘어가고, 같은 계정이라 다시 올릴 필요가 없다. 상대방은 카카오 알림톡·이메일 링크로 본인 인증 후 가입 없이 서명한다. 마감 하루 전 자동 재알림이 가고, 서명이 끝나면 감사추적 인증서가 발급된다 ([넥스트데일리](https://www.nextdaily.co.kr/news/articleView.html?idxno=254199), [아시아경제](https://view.asiae.co.kr/article/2026042009230800903)). AI 경로는 editor.yesform.com → (선택) 프로필 설정 → 맞춤 프롬프트나 직접 입력 → 초안 → 같은 화면에서 다듬기 → 다운로드·인쇄다. 공식적으로 밝힌 한계는 세 가지다. "예스폼 AI는 실수할 수 있다"는 면책 문구, 입력 내용이 **OpenAI 서버로 전송되니 개인정보를 넣지 말라는 고지**(AI 스피치에서 확인, 무료서식 AI 패널은 〔판독 추정〕), 비로그인 횟수 제한이다 ([AI 스피치](https://speech.yesform.com/docs/ai_speech_view.php), [예스폼 무료서식](https://www.yesform.com/docs/freeMain.php)). 에디터 AI가 쓰는 모델명은 공개되지 않았다.

요금 정보는 서로 어긋난다. 블로그는 회원은 자유롭게 쓰고 비로그인은 **무료 10회**라고 한다. 무료서식 페이지의 AI 채팅 패널에는 "무료 100회"와 약 9,900원 유료 구간이 보이지만 글자가 깨져 〔판독 추정〕이며, 서로 다른 기능일 수 있다 ([예스폼 블로그](https://blog.yesform.com/entry/%EC%98%88%EC%8A%A4%ED%8F%BC-%EC%97%90%EB%94%94%ED%84%B0%EB%A1%9C-%EB%AC%B8%EC%84%9C-%EC%9E%91%EC%84%B1-%EC%8B%9C%EA%B0%84%EC%9D%84-%EC%A0%88%EB%B0%98%EC%9C%BC%EB%A1%9C-%EC%A4%84%EC%9D%B4%EC%84%B8%EC%9A%94-ft-AI), [예스폼 무료서식](https://www.yesform.com/docs/freeMain.php)). 상세 페이지 가격 카드는 "프리미엄 무제한 월 9,000원"이다 ([상세](https://www.yesform.com/forms/vform_100577.php)). 2026년 10월 기사는 로그인한 무료회원도 에디터를 쓸 수 있다고 전한다 ([넥스트데일리](https://www.nextdaily.co.kr/news/articleView.html?idxno=254199)). AI를 따로 파는 상품이라기보다 **가입을 유도하는 장치**에 가깝다〔추정〕.

## 경쟁사도 모두 자유 생성 초안이고, 출처를 다는 곳은 없다

네 서비스를 같은 축으로 놓으면 차이가 분명해진다. 비즈폼은 서식 수(26만+)와 단계형 AI 메뉴가 강하다. 한컴은 HWP 편집기와 데스크톱 통합이, 모두싸인은 전문가 검토 서식과 계약 메타데이터 추출이 강하다. 그런데 **기존 서식의 필드를 사용자 입력으로 채우는 기능을 내세우는 곳도, 출처 인용을 언급하는 곳도 없다.** 단, 출처 인용 기능이 없다고 확인한 것이 아니라 언급이 없다는 뜻이다.

| 항목 | 예스폼 | 비즈폼 | 한컴독스 AI / 한컴어시스턴트 | 모두싸인 |
|---|---|---|---|---|
| 분류 | A·B·C 3단 코드 트리 + Z 패싯 + 사용자·시즌·상황 큐레이션 | 대분류 8개(일반·샘플·부서별·표준·엑셀·PPT·계약서·이력서/자소서)에 형식·유형·부서가 섞임, 업종·직무 필터는 홈에서 안 보임 | 용도별 AI 템플릿(기획서·이력서·보고서·공문서·보도자료) | 제공처(전문가/기관) × 분야(인사/노무·스타트업·지분/투자 등) |
| 규모 | "100만", A11 약 8만〔추정〕, 웹 편집 1만+ | "26만+" | 비공개(베타 "6종" 서술은 〔미검증〕) | 소수 정예, 무료 |
| 편집 모델 | 원본 파일 다운로드 + 일부만 웹 에디터 | HWP 다운로드 + AI 결과용 웹 편집기(DOCX/PDF 출력) | 데스크톱 한글(누름틀 있음) + 웹 한글 | 웹 서식 작성기에서 서명 입력란 배치 |
| AI 입력 → 출력 | 주제·프롬프트(프로필 기반 추천) → 초안, 계약 변수 → 표·서명란 초안 | 설명 2,000자 + 구성(글/표/글+표) + 어조(5종) → 초안 30~50초, 프롬프트 수정 적용·재생성 | 주제 → 초안(표·이미지 포함), 요약·번역·교정·이어 쓰기, 저장형 "맞춤 AI 서식", 노션·PC 파일을 근거로 초안을 쓰는 에이전트 | 완성 계약서 → 제목·상대방·날짜·금액·유형 자동 추출, 갱신 알림 |
| 빈칸 처리 | 사람이 직접 입력 | 개인정보는 프롬프트가 아니라 "생성된 표 칸에 직접" 넣으라고 안내 | 공식 기능으로 누름틀을 채운다는 언급 없음 | 서명용 입력란 |
| 특기 기능 | 작성 → 전자서명 → 감사추적까지 한 흐름 | "문서 표준화": 내용 유지·구조만 재배치, 원본/결과 나란히 비교, 변경 개수 표시, 결재선 토글 | 기본 무료, 고급은 하루 10회 무료 | 업스테이지와 계약 특화 AI MOU |

출처: [비즈폼 홈](https://bizforms.co.kr/), [비즈폼 AI 생성 가이드](https://www.bizforms.co.kr/businessmap/ai-guide/ai-generate.asp), [비즈폼 AI 표준화 가이드](https://www.bizforms.co.kr/businessmap/ai-guide/ai-standardize.asp), [CIO Korea](https://www.cio.com/article/3542389/), [Byline 2025-06](https://byline.network/2025/06/6241253/), [Byline 2025-09](https://byline.network/2025/09/9253/), [모두싸인 FAQ](https://docs.channel.io/modusign_faq/ko/articles/bac0e1dc-서식검색), [Byline 2025-12](https://byline.network/2025/12/1211-2/)

비교 대상들의 공통 기반은 OpenAI다. 예스폼은 고지문으로, 비즈폼은 개인정보처리방침으로(검색 요약 기준 〔미검증〕) 확인된다. 한컴독스 AI의 DALL·E 3·GPT-4o 적용도 검색 요약 기준이다〔부분 미검증〕 ([Byline 2024-10](https://byline.network/2024/10/241014_004/)). 따라서 모델 품질은 차별점이 되기 어렵다. 차이는 **AI 앞뒤의 구조**에서 난다. 비즈폼은 생성 전에 구성·어조를 고르게 하고, 생성 후에는 표준화와 비교를 붙인다. 한컴은 근거 자료(노션·PC 파일)를 끌어오는 에이전트를 붙였다. 모두싸인은 완성 문서에서 필드를 역으로 뽑아낸다. 한컴 실무 가이드도 어시스턴트 초안을 "완성본이 아니라 첫 문단과 기본 구조를 잡는 용도"로 보고 사실 확인은 사람 몫으로 둔다 ([flow 블로그](https://platform.flow.team/blog/hancom-office-hancom-assistant-workflow)). 시장 전체가 아직 "초안 → 사람 검증" 단계에 있다는 뜻이다. 비즈폼의 "빈 표 셀 = 빈칸" 방식은 기계가 그 칸의 의미를 모르므로 이후 자동 채우기와 검증이 어렵다. 슬롯에 타입과 의미를 붙이는 쪽이 구조적으로 앞선다.

## VibeDocStudio가 가져올 것: 분류, 서식 메타, 슬롯 스키마, 작성 흐름

### 분류는 트리 하나에 이름공간이 있는 패싯을 붙인다

예스폼에서 가져올 핵심은 **트리는 얕게 두고(대·중·소 3단, 중분류마다 가장 자연스러운 소분류 축), 나머지는 직교 패싯과 "누가·언제·왜" 큐레이션으로 처리하는 구조**다. 다만 바꿀 점이 세 가지 있다. 첫째, 파일 형식은 분류 축에서 빼고 출력 옵션으로 돌린다. 비즈폼처럼 형식과 유형을 한 층에 섞으면 탐색이 검색에 의존하게 된다. 둘째, 패싯 값은 `industry:manufacturing`, `role:hr-manager`처럼 **이름공간을 붙인 ID**로 둔다. 그래야 `Z11B11` 충돌을 피한다. 셋째, 모두싸인의 "제공처/검토자" 축을 `reviewedBy` 신뢰 배지 패싯으로 추가한다. 사업계획서 "목차별 슬라이드"처럼 **문서 안의 섹션 단위 분류**는 VibeDocStudio의 블록 라이브러리(Phase 1 아웃라인의 섹션 후보)에 그대로 대응한다. 시즌 type3(법·제도 변경)은 "이 서식은 최저임금 개정 때 갱신이 필요하다" 같은 갱신 트리거로도 쓸 수 있다.

### 서식 메타는 예스폼식 상품 메타와 법제처식 법정 메타를 합친다

서식 메타 스키마는 두 계열을 합치는 것이 가장 자연스럽다. 하나는 예스폼 상세 화면 항목을 필드로 옮긴 "상품 메타"다. 다른 하나는 법제처 국가법령정보 공동활용 API의 별표서식 목록(`target=licbyl`) 응답을 그대로 쓴 "법정 메타"다. 이 API는 별표명·별표번호·별표종류(knd: 1 별표, 2 서식, 3 별지, 4 별도, 5 부록)·관련법령명/ID·소관부처·공포일자/번호·제개정구분·법령종류·**별표서식파일링크(HWP)와 PDF 링크**·법령상세링크를 돌려준다. 행정규칙·자치법규용 같은 계열 API도 있다 ([별표서식 목록 API 가이드](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsBylListGuide), [OPEN API 활용가이드 목록](https://open.law.go.kr/LSO/openApi/guideList.do)). 호출하려면 서버 IP와 도메인을 등록한 인증키가 필요하다. 샘플 키 `OC=test`로는 검증에 실패한다. 링크 파일이 HWP인지 HWPX인지도 인증키 없이 확인하지 못했다〔미검증〕. 아래 제안 스키마의 필드명은 예스폼·법제처 원천을 주석으로 표시했다. 스키마 자체는 이 조사에서 도출한 설계 제안이다.

```jsonc
{
  "id": "tpl_...",
  "title": "표준 취업규칙",                 // 예스폼 h1, 연도 접두는 editionYear로 분리
  "editionYear": 2027,
  "categoryPath": ["A11", "A11B11", "A11B11C12"],   // 트리 경로(예스폼 division 호환 가능)
  "facets": { "industry": [], "role": [], "season": [], "situation": [], "use": [], "style": [] },
  "tags": [],
  "tier": "free | paid | premium",
  "author": { "name": "", "team": "", "verified": true },
  "reviewedBy": [{ "org": "", "kind": "lawfirm | laborfirm | agency" }],   // 모두싸인식 신뢰 신호
  "extent": { "pages": 27, "sheets": null },
  "stats": { "views": 0, "reviews": 0 },
  "purpose": "",                            // 목적 및 용도
  "spec": { "editable": true, "relatedLaws": [], "obligation": "" },        // 예스폼 상세 스펙
  "toc": [], "howToSteps": [], "faq": [],
  "formats": [{ "encodingFormat": "application/hwp+zip", "source": "" }],
  "legal": {                                // 법정 서식일 때만, 법제처 licbyl 응답 매핑
    "formName": "별표명", "formNo": "별표번호(가지번호 포함)", "formKind": "별표|서식|별지|별도|부록",
    "law": { "name": "", "id": "", "serial": "", "kind": "" },
    "ministry": "", "promulgation": { "date": "", "no": "" }, "revisionType": "",
    "files": { "hwp": "", "pdf": "" }, "detailUrl": ""
  },
  "slots": [ /* 아래 슬롯 스키마 */ ]
}
```

예스폼에는 없지만 VibeDocStudio에는 있어야 할 것도 정리해 둔다. 예스폼은 등록일·수정일·파일 크기를 보여 주지 않고, 미리보기를 평문으로만 둔다. VibeDocStudio는 `updatedAt`과 `legal.promulgation`을 함께 저장해야 개정 추적이 된다. 검색 색인용 평문과 별개로 블록·슬롯 구조를 원본으로 저장해야 한다. 공개 페이지 SEO가 필요하다면 FAQPage·HowTo에 그치지 말고 schema.org `DigitalDocument`에 형식별 `encodingFormat`을 붙이는 편이 낫다〔설계 제안〕.

### 슬롯 하나가 HWPX·DOCX·PDF의 필드 하나에 대응한다

세 파일 형식은 모두 "기계용 이름 + 타입 + 값 + 사람용 이름/안내문"이라는 같은 골격을 가진다. 그래서 슬롯 하나로 세 형식을 감쌀 수 있다. 한컴 HWPML 3.0 명세를 기준으로 보면, 한글 필드는 `FIELDBEGIN`의 `Type`(Clickhere=누름틀, Mailmerge, Date 등)·`Name`·`InstId`(문서 안 고유 인스턴스)·`Editable`·`Dirty`·`Command`로 표현된다. 표 셀 `CELL`은 `Name`(셀 필드 이름)·`ColAddr/RowAddr`·`ColSpan/RowSpan`·`Header`·`Protect`·`Editable`을 가진다. 양식 개체 `FORMOBJECT`는 `Name`·`GroupName`·`TabOrder`를 가지고, EDIT에는 `MaxLength`·`MultiLine`·`Number`·`ReadOnly`가 더 있다. 명세 목차가 "셀 필드 이름"과 "누름틀 필드 이름"을 별도 블록으로 두는 것으로 보아, **한글의 필드 이름 체계는 누름틀 이름과 셀 이름 두 축**이다 ([한컴 HWPML 3.0 rev1.2 명세](https://cdn.hancom.com/link/docs/한글문서파일형식3.0_HWPML_revision1.2.pdf)). HWPX(OWPML, KS X 6101)는 ZIP 안의 `Contents/section0.xml`에 셀을 `<hp:tc>`·`<hp:cellAddr>`·`<hp:cellSpan>`으로 둔다 ([mulerun hwpx 스킬 문서](https://mulerun.com/skillshub/@iamseungpil/claude-for-dslab~hwpx:20260203231443/llm.txt)). 자동화 예제는 `<hp:fieldBegin … name="{필드명}">`을 찾아 값을 채운다 ([Hugging Face boxlabel](https://huggingface.co/spaces/dohyune/boxlabel/blob/main/app.py)). DOCX는 `w:sdt > w:sdtPr`에 `alias`(사람용)·`tag`(기계용)·`id`·잠금·placeholder·`dataBinding`(XPath)과 타입 요소(`text`, `date`, `dropDownList`, `comboBox`, `picture`, `checkbox`, `repeatingSection` 등)를 둔다 ([Microsoft Learn SdtProperties](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtproperties)). PDF AcroForm은 `/Fields` 배열의 각 필드에 `/T`(부분 이름, 점으로 이어 완전한 이름이 됨)·`/TU`(사용자용 이름)·`/FT`(Tx·Btn·Ch·Sig)·`/V`·`/Ff`(필수·읽기 전용·여러 줄 플래그)를 둔다. 다만 이번에는 원문 열람에 실패해(HTTP 429) **기존 지식에 기댄 〔미검증〕 항목**이다 ([ISO 32000-1 Adobe 공개본](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)).

| VibeDocStudio 슬롯 필드 | HWPX / HWPML | DOCX 콘텐츠 컨트롤 | PDF AcroForm 〔미검증〕 | 법제처 API · 법정 서식 관행 |
|---|---|---|---|---|
| `id` (인스턴스) | `FIELDBEGIN@InstId` | `w:id` | 위젯 주석 | 해당 없음 |
| `name` (데이터 키, 예: `신청인.성명`) | 누름틀 `FIELDBEGIN@Name` / OWPML `hp:fieldBegin@name`, 셀 `CELL@Name`(OWPML `hp:tc` 대응은 〔미검증〕) | `w:tag` | `/T` (점 표기 계층) | API는 서식 단위 메타만 주고 칸 정보는 없음 → HWP 파일에서 추출 |
| `label` | (전용 속성 없음, 인접 라벨 셀 텍스트) | `w:alias` | `/TU` | 서식 안의 칸 제목("성명", "생년월일") |
| `guide` (안내문) | 누름틀 안내문(OWPML 파라미터 이름은 〔미검증〕) | placeholder | (표준 키 없음) | "※ … 적습니다" 안내 문구 |
| `type` | `Type=Clickhere/Date/Mailmerge`, 양식 개체 EDIT·CHECKBUTTON·RADIOBUTTON·COMBOBOX | `text/richText/date/dropDownList/comboBox/checkbox/picture` | `/FT` Tx·Btn·Ch·Sig | — |
| `readOnly` / `locked` | `Editable`, 셀 `Protect`, 양식 모드 `LockForm` | lock | `/Ff` 읽기 전용 | — |
| `required` | (전용 속성 없음) | (전용 속성 없음) | `/Ff` 필수 | — |
| `options[]`, `groupName` | COMBOBOX·LISTBOX, `GroupName` | `dropDownList`/`comboBox` 항목 | Ch 선택지, Btn 라디오 그룹 | — |
| `maxLength`, `multiline`, `format` | EDIT `MaxLength`·`MultiLine`·`Number` | (text의 여러 줄 옵션) | `/Ff` 여러 줄 | 주민번호·날짜 칸 관행 |
| `order` | `TabOrder` | 문서 순서 | 위젯 순서 | — |
| `filledBy` (applicant/agency/approver) | 셀 음영·`Protect`로 추론 | 잠금으로 추론 | 읽기 전용으로 추론 | **"색상이 어두운 칸은 신청인이 적지 않습니다" → agency** |
| `binding` | Mailmerge 필드 이름 규약 | `dataBinding` XPath | 완전한 이름 | — |
| 표 위치·병합·머리글 | `ColAddr/RowAddr`, `ColSpan/RowSpan`, `Header` / `hp:cellAddr`, `hp:cellSpan` | 표 셀(+`repeatingSection`으로 반복 행) | 위젯 좌표 | 결재란은 반복 열 슬롯〔설계 제안, 관행 원문은 〔미검증〕〕 |
| 서명·날인 | 표준 타입 없음 → 이미지 슬롯 또는 "(서명 또는 인)" 앵커 | `picture` 또는 앵커 | `/FT Sig` | "신청인 (서명 또는 인)" + 날짜 |

법정 서식 관행은 슬롯 메타 플래그로 옮기면 된다. 머리 영역의 `receipt{접수번호, 접수일, 처리기간}`, 음영 칸의 `filledBy: agency`, 꼬리 영역의 `signature{서명 또는 인, 날짜}`, 수신 기관장 표기, `attachments[]`(구비서류), `fee`(수수료)가 그 예다. 근거는 "별지 제1호의2서식"류 서식에서 반복되는 접수번호·처리기간 표와 음영 칸 안내다 ([국가인권위 정보공개 청구서 PDF](https://www.humanrights.go.kr/template/resources/file/%5B%EB%B3%84%EC%A7%80%20%EC%A0%9C1%ED%98%B8%EC%9D%982%EC%84%9C%EC%8B%9D%5D%20%EC%A0%95%EB%B3%B4%EA%B3%B5%EA%B0%9C%20%EC%B2%AD%EA%B5%AC%EC%84%9C.pdf); 검색 스니펫 기준). 매핑 규칙의 핵심은 `slot.name`을 **문서 안에서 안정적이고 사람이 읽을 수 있는 데이터 키**로 고정하는 것이다. 내보낼 때는 이 키를 HWPX 누름틀/셀 이름, DOCX `w:tag`, PDF `/T`에 그대로 쓰고, `label`은 `w:alias`·`/TU`, `guide`는 누름틀 안내문·placeholder로 보낸다. 한글의 메일머지와 `PutFieldText` 일괄 채우기가 모두 "필드 이름 = 데이터 키" 규약 위에서 돌아가므로 ([위키독스](https://wikidocs.net/261665)), 이 규약을 지키면 공공·기업의 HWP 서식 자산을 가져오고 내보내는 경로가 열린다. 커뮤니티가 이미 HWPX 양식을 "구조 읽기 → AI 값 생성 → 되써넣기" 3단으로 채우려 시도하고 있다는 점도 이 방향을 뒷받침한다 ([GPTers](https://www.gpters.org/nocode/post/designed-first-using-skill-TNakw6hzChlML7M)). VibeDocStudio 고유의 확장으로는 칸마다 `evidence[]{sourceUrl, excerptRef, retrievedAt}`와 `aiFillable: true|false`(민감정보는 false)를 둔다. 경쟁사 어디에도 없는 두 필드다.

### AI 작성 흐름은 템플릿을 우선하고 칸 단위로 근거를 단다

예스폼·비즈폼·한컴·모두싸인의 장점은 VibeDocStudio의 세 단계에 자연스럽게 나눠 담을 수 있다. **Phase 1(뼈대/아웃라인)**에는 예스폼 에디터의 "분야·업종·문서 형식·경력" 사전 프로필과 맞춤 프롬프트, 비즈폼의 구성(글/표/글+표)·어조 선택, 인기 문서 버튼이 예시 프롬프트를 채워 주는 "프롬프트 템플릿"을 둔다. 맥락 수집을 가볍게 만드는 장치들이다. **Phase 2(서식)**에서는 예스폼의 "전문가 서식 우선, 없으면 생성" 순서를 따른다. 트리·패싯·큐레이션으로 검증된 템플릿을 먼저 제시하고, 맞는 것이 없을 때만 생성 경로로 넘긴다. 사용자가 가져온 기존 문서에는 비즈폼 표준화식 "내용은 유지, 구조만 재배치, 원본/결과 비교, 변경 개수 표시"와 모두싸인 캐비닛식 "완성 문서 → 필드 역추출"을 붙여 서식화를 돕는다. **Phase 3(내용 채우기)**는 경쟁사가 모두 비워 둔 영역이다. 타입이 있는 슬롯을 하나씩 채우고, 한컴 에이전트처럼 첨부·노션 같은 근거 자료에서 값을 가져오되 칸마다 출처 링크를 남긴다. `filledBy: agency`인 칸과 `aiFillable: false`인 민감정보 칸(비즈폼이 "프롬프트 말고 칸에 직접"이라고 안내하는 이름·주민번호·연락처)은 AI가 건드리지 않는다. 법정 서식이라면 `legal.detailUrl`(법제처 법령상세링크)이 서식 전체의 기본 근거가 된다. 마지막으로 예스폼이 "작성 → 서명용 PDF → 전자서명 → 감사추적"을 한 흐름으로 이은 것처럼, 문서 종류별 "다음 행동"(출력, 결재, 서명 요청)을 Phase 3 끝에 붙이면 작성 도구에서 업무 도구로 넘어간다.

## 확인되지 않았거나 추정한 항목

| 항목 | 상태 | 내용 |
|---|---|---|
| 서식 건수(A11 약 7.98만, 무료 약 1.9만, 전체 약 25만) | 〔추정〕 | JS 변수 `Total`을 주석대로 "총 페이지 수"로 보고 ×50으로 계산했다. 마지막 페이지가 덜 찰 수 있어 상한값이다. 외부 교차 검증은 하지 않았다 |
| "100만 서식"의 구성 | 〔추정〕 | 개정판·제휴·영문 등을 합친 마케팅 수치로 해석했다 |
| 무료서식 AI 패널의 "무료 100회 / 9,900원", OpenAI 고지, 에디터 툴바(Pretendard 등), 메인 "AI 검색" 라벨 | 〔판독 추정〕 | EUC-KR 페이지 글자 깨짐. 블로그의 "비로그인 10회"와 충돌한다 |
| AI 스피치 9,900원 유료 조건 | 〔판독 추정〕 | 표기는 있으나 조건을 판독하지 못했다 |
| 홈 메뉴 형식·카테고리 라벨 일부 | 〔판독 추정〕 | WebFetch 결과 일부 글자가 깨졌다 |
| 예스폼 에디터 첫 오픈일 | 〔추정〕 | 공지 본문이 깨져서 2026년 상반기로 추정했다 |
| 예스폼 번역·문법 교정 | 〔미검증〕 | 검색 요약에만 나온다 |
| 에디터 내부의 입력란·서명란 표현, 다운로드 형식, HWP 원본의 누름틀 사용 | 〔미검증〕 | 로그인이 필요하거나 파일을 열어 보지 못했다 |
| 법률·생활·교육행정의 숨은 C코드, 상황 축 전체 목록, `aDiv/dDiv/aFilter/action_type`의 의미 | 미확인 | 직접 조회하지 않았거나 AJAX로 로드된다 |
| OWPML 누름틀 `type="CLICK_HERE"`와 안내문 파라미터, `hp:tc`와 HWPML `CELL` 속성의 1:1 대응 | 〔미검증〕 | HWPML 3.0은 원문으로 확인했지만 OWPML 원문은 확인하지 못했다. 누름틀을 넣은 HWPX의 `section0.xml`을 직접 열어 확인해야 한다 |
| PDF AcroForm 키(`/T`, `/TU`, `/FT`, `/Ff`) | 〔미검증〕 | ISO 32000-1 원문 열람 실패(429). 12.7절 확인을 권장한다 |
| 법제처 `별표서식파일링크`의 HWP/HWPX 여부 | 〔미검증〕 | 인증키가 필요하다 |
| 결재란이 법정 서식이 아니라 기관 내부 기안문 관행이라는 점 | 〔미검증〕 | 행정업무운영 편람 원문은 확인하지 못했다 |
| 비즈폼 표준화 업로드 한도(10MB와 30MB), 요금제 금액, OpenAI 국외이전 | 〔미검증〕 | 페이지마다 다르고 검색 요약 기준이다 |
| 한컴독스 AI 템플릿 "6종", DALL·E 3·GPT-4o 적용, 모두싸인 캐비닛 세부 | 〔부분 미검증〕 | 검색 요약 기준 |
| 멤버십 가격(나무위키) | 〔미검증, 시점 불명〕 | 오래된 정보일 수 있다 |
| 미리캔버스·망고보드·네이버 클로바 | 미조사 | 이번 범위에서 다루지 못했다 |

## 결론

예스폼 조사에서 드러난 사실은 한국 서식 시장의 경쟁 축이 아직 **"얼마나 많은 원본 파일을 어떻게 찾게 하느냐"**라는 점이다. 예스폼은 30년 동안 쌓은 분류·큐레이션 체계를 갖췄지만, 칸 구조는 원본 HWP·DOCX 안에 갇혀 있다. 웹 편집이 1만여 종에 그치는 것도 원본을 편집 구조로 바꾸는 데 비용이 많이 든다는 신호로 읽힌다〔추정〕. AI는 그 빈틈을 "없으면 생성"으로 메우는 보조 장치이고, 경쟁사도 같은 자리에 서 있다. 그래서 VibeDocStudio의 기회는 서식 수나 생성 품질이 아니다. **서식을 처음부터 이름·타입·채우는 주체·근거를 가진 슬롯의 집합으로 저장하는 것** 자체가 기회다. 이 표현이 있어야 "AI가 채울 칸과 사람이 채울 칸을 나누고, 채운 값마다 출처를 보여 주는" 기능이 가능해진다. 경쟁사의 빈 표 셀과 평문 미리보기로는 따라올 수 없는 영역이다.

실행 순서도 이 결론에서 나온다. 가장 먼저 검증할 것은 HWPX 누름틀·셀 이름을 슬롯으로 손실 없이 왕복시키는 일이다. 한글 서식 자산을 흡수할 수 있는지가 여기서 갈리고, 지금 가장 큰 미검증 구간이기도 하다. 그다음은 법제처 별표서식 API 인증키를 발급받아 법정 메타를 자동으로 채우고 법령상세링크를 칸의 기본 근거로 연결하는 일이다. 이 두 가지가 서면, 예스폼식 트리·패싯·3축 큐레이션은 그 위에 얹는 탐색 계층이 된다. 이때 패싯 이름공간 충돌 같은 예스폼의 실수는 처음부터 피하면 된다.
