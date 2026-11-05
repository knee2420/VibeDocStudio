/** 테스트 픽스처: 시드 작업 공간의 실제 문서 · 프로젝트 (apps/api/data/knowledge). */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { VDocDocument, VProjectManifest } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const knowledge = join(here, "..", "..", "..", "apps", "api", "data", "knowledge");

export function seedDocuments(): VDocDocument[] {
  const dir = join(knowledge, "documents");
  return readdirSync(dir)
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name, "document.vdoc.json"), "utf-8")) as VDocDocument);
}

export function seedProjects(): VProjectManifest[] {
  const dir = join(knowledge, "projects");
  return readdirSync(dir)
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name, "project.vproj.json"), "utf-8")) as VProjectManifest);
}

export const SNAPSHOT_PATH = join(here, "__snapshots__", "block-behavior.json");
