import React from "react";

/**
 * 한국식 서식 더미 — 표 안의 표 · 세로 머리글 · 결재란 · 기관 작성 칸 · 고정 안내문.
 * 아웃라인이 이런 "형식 없는 표"를 어떻게 다루는지 보려는 것이라 생김새만 흉내 낸다.
 */

const td = "border border-black/70 px-1.5 py-1 align-middle";
const th = `${td} bg-[#f2f2f2] text-center font-medium whitespace-nowrap`;
const blank = <span className="inline-block w-full h-4" />;

/** 시험 불참원 (학교 서식) */
export const FormAbsence: React.FC = () => (
  <div className="text-[10.5px] leading-[16px] text-black">
    <h2 data-anchor="f1-title" className="text-center text-[18px] font-bold tracking-[0.6em] mb-4">시험 불참원</h2>

    <table data-anchor="f1-applicant" className="w-[70%] mx-auto border-collapse mb-4">
      <tbody>
        {[
          ["학과(부)", "전 공"],
          ["학 번", "학 년"],
          ["성 명", "연락처"],
        ].map(([a, b]) => (
          <tr key={a}>
            <td className={`${th} w-[18%]`}>{a}</td>
            <td className={`${td} w-[32%]`}>{blank}</td>
            <td className={`${th} w-[18%]`}>{b}</td>
            <td className={`${td} w-[32%]`}>{blank}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div data-anchor="f1-reason" className="space-y-2 mb-2 rounded">
      <div>1. 시험불참 기간 : 20&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;. ~ &nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;.</div>
      <div>2. 시험불참 사유 :</div>
      <div>3. 시험 교과목 :</div>
    </div>

    <table data-anchor="f1-subjects" className="w-full border-collapse mb-3">
      <thead>
        <tr>
          {["번호", "교과목", "담당교수", "시험일", "교시", "시험장소 확인"].map((h, i) => (
            <th key={h} className={`${th} ${i === 1 ? "w-[34%]" : ""}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 8 }, (_, r) => (
          <tr key={r}>
            <td className={`${td} text-center`}>{r + 1}</td>
            {Array.from({ length: 5 }, (_, c) => (
              <td key={c} className={td}>{blank}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>

    <div data-anchor="f1-notice" className="text-[9.5px] leading-[14px] text-black/75 mb-4 rounded">
      ※ 시험 불참 사유 발생 시 시험일로부터 7일 이내 증빙서류와 함께 제출하여야 함.
      <br />※ 공결 인정 사유 : 1) 본인 질병으로 인한 입원 &nbsp;2) 직계 가족의 사망 &nbsp;3) 병역 의무 이행 (각 증빙서류 첨부)
    </div>

    <div data-anchor="f1-sign" className="text-center space-y-2 mb-4 rounded">
      <div>상기 사유로 정기시험에 불참하여 시험 불참원을 제출합니다.</div>
      <div>20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일</div>
      <div className="text-right pr-6">신청인 : ____________ (인)</div>
    </div>

    {/* 표 안의 표 — 왼쪽 확인 칸 · 오른쪽 결재란 */}
    <table data-anchor="f1-approval" className="w-full border-collapse mb-4">
      <tbody>
        <tr>
          <td className="w-[40%] p-0 align-top pr-3">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className={`${th} w-8 leading-[14px]`}>전<br />공<br />주<br />임<br />교<br />수</td>
                  <td className={`${td} h-[86px]`}>
                    <div className="text-center text-black/60">확 인</div>
                    <div className="text-right pr-1 mt-8">(인)</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td className="w-[60%] p-0 align-top">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td rowSpan={2} className={`${th} w-8 leading-[14px]`}>결<br /><br />재</td>
                  {["담 당", "주 임", "과 장", "처 장"].map((h) => (
                    <td key={h} className={th}>{h}</td>
                  ))}
                </tr>
                <tr>
                  {Array.from({ length: 4 }, (_, i) => (
                    <td key={i} className={`${td} h-[62px]`} />
                  ))}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    <div data-anchor="f1-to" className="text-[13px] font-bold rounded">
      <span className="inline-block w-28 border-b border-black align-bottom" /> 교수님 귀하
    </div>
  </div>
);

/** 시험 · 분석 · 검정 성적서 증명 교부신청서 (법정 별지 서식) */
export const FormCertificate: React.FC = () => (
  <div className="text-[10.5px] leading-[16px] text-black">
    <div data-anchor="f2-head" className="rounded">
      <div className="text-[9px] text-black/70">■ 국가표준기본법 시행규칙 [별지 제7호서식] &lt;개정 2017. 7. 26.&gt;</div>
      <h2 className="text-center text-[16px] font-bold my-2">시험 · 분석 · 검정 성적서 증명 교부신청서</h2>
      <div className="flex text-[9px] text-black/70 border-t-2 border-black pt-0.5">
        <span>※ 색상이 어두운 칸은 신청인이 작성하지 않습니다.</span>
        <span className="ml-auto">(앞쪽)</span>
      </div>
    </div>

    <table data-anchor="f2-receipt" className="w-full border-collapse mb-0">
      <tbody>
        <tr>
          <td className={`${td} bg-[#d9d9d9] w-[18%]`}>접수번호</td>
          <td className={`${td} bg-[#d9d9d9] w-[32%]`} />
          <td className={`${td} bg-[#d9d9d9] w-[18%]`}>접수일자</td>
          <td className={`${td} bg-[#d9d9d9]`}>처리기간 &nbsp;즉시</td>
        </tr>
      </tbody>
    </table>

    {/* 세로 머리글 '신청인' 아래 여러 줄 — 표 안에 묶인 정보 */}
    <table data-anchor="f2-applicant" className="w-full border-collapse">
      <tbody>
        <tr>
          <td rowSpan={4} className={`${th} w-[12%]`}>신청인</td>
          <td className={`${th} w-[16%]`}>성명</td>
          <td className={`${td} w-[26%]`}>{blank}</td>
          <td className={`${th} w-[16%]`}>생년월일</td>
          <td className={td}>{blank}</td>
        </tr>
        <tr>
          <td className={th}>주소</td>
          <td colSpan={3} className={td}>{blank}</td>
        </tr>
        <tr>
          <td className={th}>업체명</td>
          <td className={td}>{blank}</td>
          <td className={th}>전화번호</td>
          <td className={td}>{blank}</td>
        </tr>
        <tr>
          <td className={th}>대표자</td>
          <td className={td}>{blank}</td>
          <td className={th}>사업자등록번호</td>
          <td className={td}>{blank}</td>
        </tr>
      </tbody>
    </table>

    <table data-anchor="f2-test" className="w-full border-collapse mb-0">
      <tbody>
        {["시험 접수번호", "원본 발급 연월일", "용도", "신청 부수"].map((h) => (
          <tr key={h}>
            <td className={`${th} w-[28%] text-left`}>{h}</td>
            <td className={td}>{blank}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <table data-anchor="f2-statement" className="w-full border-collapse mb-3">
      <tbody>
        <tr>
          <td className={`${td} py-3`}>
            <p className="indent-3">
              「국가표준기본법 시행규칙」 제18조제3항에 따라 위와 같이 시험 · 분석 · 검정 성적서의 증명 교부를 신청합니다.
            </p>
            <div className="text-right mt-3 pr-4">년&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;일</div>
            <div className="text-right mt-1 pr-4">신청인 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명 또는 인)</div>
            <div className="mt-3 font-bold text-[12px]">기술표준원장 <span className="font-normal">귀하</span></div>
          </td>
        </tr>
      </tbody>
    </table>

    <table data-anchor="f2-fee" className="w-full border-collapse mb-3">
      <tbody>
        <tr>
          <td className={`${th} w-[18%]`}>수수료</td>
          <td className={`${td} text-center`}>「국가표준기본법 시행규칙」 별표에 따른 수수료</td>
        </tr>
      </tbody>
    </table>

    <div data-anchor="f2-flow" className="rounded">
      <div className="text-center font-bold border-y border-black py-0.5 mb-2">처 리 절 차</div>
      <div className="flex items-center justify-between gap-1 text-[9.5px]">
        {["신청서 작성", "접 수", "검 토", "결 재", "증명서 교부"].map((s, i, a) => (
          <React.Fragment key={s}>
            <div className="flex-1 text-center">
              <div className="border border-black/70 py-1.5">{s}</div>
              <div className="text-[8.5px] text-black/60 mt-0.5">{i === 0 ? "신청인" : "처리기관"}</div>
            </div>
            {i < a.length - 1 && <span className="text-black/60">→</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="text-right text-[8.5px] text-black/50 mt-3">210mm×297mm[일반용지 60g/㎡(재활용품)]</div>
    </div>
  </div>
);
