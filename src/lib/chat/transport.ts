import type { ChatTransport } from "./types";
import { createMockTransport } from "./mock/mock-transport";
import { createHttpTransport } from "../api/http-transport";

/** Real backend when VITE_API_BASE_URL is set; labelled demo otherwise. */
export function selectTransport(baseUrl: string | undefined, shouldFail: () => boolean): ChatTransport {
  return baseUrl && baseUrl.trim() ? createHttpTransport(baseUrl.trim()) : createMockTransport({ shouldFail });
}
