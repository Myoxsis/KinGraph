import { z } from "zod";
import { extractIndividual } from "../../../../extract";
import { scoreConfidence } from "../../../../confidence";
import type { IndividualRecord } from "../../../../schema";

const MAX_HTML_BYTES = 1024 * 1024; // 1MB
const HTML_DETECTION_REGEX = /<\/?[a-z][^>]*>/i;

const requestSchema = z.object({
  html: z.string().min(1, "HTML is required"),
  sourceUrl: z.string().url().optional(),
});

export type ExtractRouteRequest = {
  body: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

export interface ExtractRouteResponse<T = unknown> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export interface ExtractSuccessResponse {
  record: IndividualRecord;
  confidence: Record<string, number>;
}

function isHtmlContent(html: string): boolean {
  return HTML_DETECTION_REGEX.test(html);
}

function exceedsPayloadLimit(html: string): boolean {
  return Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES;
}

function extractError(status: number, message: string): ExtractRouteResponse<{ error: string }> {
  return {
    status,
    body: { error: message },
    headers: {
      "content-type": "application/json",
    },
  };
}

export default {
  method: "POST" as const,
  path: "/extract",
  handler: async (
    request: ExtractRouteRequest
  ): Promise<ExtractRouteResponse<ExtractSuccessResponse | { error: string }>> => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return extractError(400, "Invalid request body");
    }

    const { html, sourceUrl } = parsed.data;

    if (exceedsPayloadLimit(html)) {
      return extractError(413, "HTML payload exceeds 1MB limit");
    }

    if (!isHtmlContent(html)) {
      return extractError(415, "Provided content is not HTML");
    }

    const record = extractIndividual(html);

    if (sourceUrl) {
      record.sourceUrl = sourceUrl;
    }

    const confidence = scoreConfidence(record);

    return {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
      body: {
        record,
        confidence,
      },
    };
  },
};
