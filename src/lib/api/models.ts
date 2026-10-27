/** Wire types for the FastAPI backend (snake_case). See docs/backend-design.md. */

export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  request_id?: string;
}
export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export interface ApiSession {
  session_token: string;
  expires_at: string;
}

export interface ApiAttachment {
  id: string;
  url: string;
  mime_type: string;
  width: number;
  height: number;
  size: number;
  name?: string;
}

export interface ApiUploadResponse {
  attachment_id: string;
  mime_type: string;
  width: number;
  height: number;
  size: number;
}

export interface ApiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "completed" | "cancelled" | "failed";
  created_at: string;
  attachments: ApiAttachment[];
  error: ApiErrorBody | null;
}

export interface ApiConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}
export interface ApiConversationDetail extends ApiConversationSummary {
  messages: ApiMessage[];
}
export interface ApiConversationPage {
  items: ApiConversationSummary[];
  next_cursor: string | null;
}

export interface ApiSendMessageRequest {
  conversation_id: string | null;
  content: string;
  attachment_ids: string[];
  client_message_id: string;
}

export type ApiGenerationStatus = "running" | "completed" | "cancelled" | "failed";
export interface ApiCancelResponse {
  status: "cancelling";
}

/** SSE event payloads. */
export interface SseMessageCreated {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  generation_id: string;
  title: string;
}
export interface SseToken {
  delta: string;
}
export interface SseDone {
  assistant_message_id: string;
  finish_reason: "stop" | "length";
}
export interface SseCancelled {
  assistant_message_id: string;
}

export type SseEvent =
  | { event: "message.created"; data: SseMessageCreated }
  | { event: "token"; data: SseToken }
  | { event: "done"; data: SseDone }
  | { event: "error"; data: ApiErrorBody }
  | { event: "cancelled"; data: SseCancelled };
