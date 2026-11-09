/** 블록 정의의 `icon` 이름 → lucide 아이콘 (블록 추가 메뉴 · 바로 추가). */
import type React from "react";
import {
  Columns2,
  FileText,
  Heading,
  Image,
  LayoutTemplate,
  List,
  MessageSquareQuote,
  PanelTop,
  Square,
  Table,
  Type,
  UserRoundPen,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "columns-2": Columns2,
  "file-text": FileText,
  heading: Heading,
  image: Image,
  "layout-template": LayoutTemplate,
  list: List,
  "message-square-quote": MessageSquareQuote,
  "panel-top": PanelTop,
  table: Table,
  type: Type,
  "user-round-pen": UserRoundPen,
};

export function blockIcon(name: string): React.ComponentType<{ className?: string }> {
  return ICONS[name] ?? Square;
}
