import React from "react";

export type DocumentSurfaceKind = "paged" | "scroll";

export interface SurfaceIconProps {
  className?: string;
}

/**
 * A4 페이지 문서(`paged`) 전용 미니 SVG: 접힌 모서리가 있는 세로 용지 + 겹친 페이지 실루엣.
 */
export const PagedDocumentIcon: React.FC<SurfaceIconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.35"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="A4 페이지 문서"
    className={className}
  >
    <path d="M2.75 1.75H8.5L11.5 4.75V12.5H2.75V1.75Z" fill="currentColor" fillOpacity="0.08" />
    <path d="M8.5 1.75V4.75H11.5" />
    <path d="M4.75 7.25H9.5" />
    <path d="M4.75 9.75H8.25" />
    <path d="M13.25 4.75V13.75C13.25 14.03 13.03 14.25 12.75 14.25H5" strokeOpacity="0.5" />
  </svg>
);

/**
 * 블로그 스크롤 글(`scroll`) 전용 미니 SVG: 상단 대표 이미지·본문 피드 카드 + 우측 세로 스크롤바.
 */
export const ScrollDocumentIcon: React.FC<SurfaceIconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.35"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="블로그 스크롤 글"
    className={className}
  >
    <rect x="2" y="1.75" width="9" height="12.5" rx="1.4" fill="currentColor" fillOpacity="0.06" />
    <rect x="3.6" y="3.5" width="5.8" height="3.4" rx="0.6" fill="currentColor" fillOpacity="0.28" strokeWidth="1.1" />
    <path d="M3.6 9H9.4" />
    <path d="M3.6 11.5H8" />
    <path d="M13.5 2.25V13.75" strokeOpacity="0.28" />
    <path d="M13.5 4.25V8.75" strokeWidth="1.8" />
  </svg>
);

/** 문서 지면 형식(`paged` | `scroll`)에 맞는 미니 서식 아이콘. */
export const DocumentSurfaceIcon: React.FC<{ surface?: DocumentSurfaceKind; className?: string }> = ({
  surface = "paged",
  className,
}) => (surface === "scroll" ? <ScrollDocumentIcon className={className} /> : <PagedDocumentIcon className={className} />);

