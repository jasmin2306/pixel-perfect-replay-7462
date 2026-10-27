/**
 * Real backend transport (FastAPI). Used only when VITE_API_BASE_URL is set.
 * No secrets live here: the browser holds only an anonymous session token.
 */
import type { ChatErrorInfo, ChatTransport, StreamHandlers, StreamOutcome } from "../chat/types";
import type { ApiErrorEnvelope, ApiSession, ApiUploadResponse } from "./models";
import { fromApiError, fromApiUpload, fromSseMessageCreated, toApiSendMessage } from "./serialize";
import { createSseParser } from "./sse";

const SESSION_KEY = "visionchat.session";

export const CONNECTION_LOST: ChatErrorInfo = {
  code: "connection_lost",
  message: "Connection lost before the reply finished.",
  retryable: true,
};

export class ApiError extends Error {
  constructor(
    public info: ChatErrorInfo,
    public status: number,
  ) {
    super(info.message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorEnvelope;
    if (body?.error?.code) return new ApiError(fromApiError(body.error), res.status);
  } catch {
    /* non-JSON */
  }
  const retryable = res.status === 429 || res.status >= 500;
  return new ApiError(
    {
      code: `http_${res.status}`,
      message: "The server could not complete the request.",
      retryable,
    },
    res.status,
  );
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Upload progress abstraction; XHR because fetch cannot report upload progress. */
export function xhrUpload(
  url: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<ApiUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as ApiUploadResponse);
      const env = body as ApiErrorEnvelope | null;
      reject(
        new ApiError(
          env?.error
            ? fromApiError(env.error)
            : {
                code: `http_${xhr.status}`,
                message: "Upload failed.",
                retryable: xhr.status >= 500,
              },
          xhr.status,
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new ApiError(
          { code: "network_error", message: "Network error during upload.", retryable: true },
          0,
        ),
      );
    signal.addEventListener(
      "abort",
      () => {
        xhr.abort();
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export function createHttpTransport(baseUrl: string): ChatTransport {
  const base = baseUrl.replace(/\/$/, "");

  async function getToken(): Promise<string> {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw) as ApiSession;
      if (new Date(s.expires_at).getTime() > Date.now() + 60_000) return s.session_token;
    }
    const res = await fetch(`${base}/sessions`, { method: "POST" });
    if (!res.ok) throw await toApiError(res);
    const s = (await res.json()) as ApiSession;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s.session_token;
  }

  async function stream(
    path: string,
    body: unknown,
    handlers: StreamHandlers,
    signal: AbortSignal,
  ): Promise<StreamOutcome> {
    try {
      const token = await getToken();
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? null : JSON.stringify(body),
        signal,
      });
      if (!res.ok || !res.body) return { type: "error", error: (await toApiError(res)).info };
      return await consumeStream(res.body, handlers);
    } catch (e) {
      if (isAbort(e)) return { type: "cancelled" };
      if (e instanceof ApiError) return { type: "error", error: e.info };
      return { type: "error", error: CONNECTION_LOST };
    }
  }

  return {
    isMock: false,
    async uploadImage(file, onProgress, signal) {
      const token = await getToken();
      return fromApiUpload(await xhrUpload(`${base}/uploads`, token, file, onProgress, signal));
    },
    sendMessage: (input, handlers, signal) =>
      stream("/messages", toApiSendMessage(input), handlers, signal),
    regenerate: (id, handlers, signal) =>
      stream(`/messages/${encodeURIComponent(id)}/regenerate`, undefined, handlers, signal),
    async cancel(generationId) {
      try {
        const token = await getToken();
        await fetch(`${base}/generations/${encodeURIComponent(generationId)}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* best effort: the aborted request also signals cancellation */
      }
    },
  };
}

/** Reads an SSE body to its terminal event. Exported for tests. */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<StreamOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return { type: "error", error: CONNECTION_LOST };
    for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
      switch (ev.event) {
        case "message.created":
          handlers.onCreated(fromSseMessageCreated(ev.data));
          break;
        case "token":
          handlers.onToken(ev.data.delta);
          break;
        case "done":
          void reader.cancel();
          return { type: "done", finishReason: ev.data.finish_reason };
        case "cancelled":
          void reader.cancel();
          return { type: "cancelled" };
        case "error":
          void reader.cancel();
          return { type: "error", error: fromApiError(ev.data) };
      }
    }
  }
}
