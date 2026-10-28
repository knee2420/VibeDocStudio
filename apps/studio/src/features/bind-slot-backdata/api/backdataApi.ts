import type { BackdataChunk } from "@vibe/vdoc-schema";

import { httpClient } from "@/shared/api";

export interface ImportBackdataPayload {
  source_title: string;
  source_type?: string;
  raw_text: string;
  tags?: string[];
}

export interface ImportBackdataResult {
  count: number;
  chunks: BackdataChunk[];
}

export const backdataApi = {
  async importRawBackdata(
    payload: ImportBackdataPayload
  ): Promise<ImportBackdataResult> {
    return httpClient.post<ImportBackdataResult>(
      "/api/backdata/import",
      payload
    );
  },
};

