export type MessageRole = "user" | "assistant";

/** Lifecycle of an assistant reply. User messages are always "completed". */
export type MessageStatus = "streaming" | "completed" | "cancelled" | "failed";

/** Structured error shown in the UI. `retryable` decides whether Retry appears. */
export interface ChatErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ImageAttachment {
  /** Server attachment id once uploaded; local id in demo mode. */
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** Local object URL right after sending, signed URL when loaded from history. */
  previewUrl: string;
  width?: number | undefined;
  height?: number | undefined;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  attachments?: ImageAttachment[];
  error?: ChatErrorInfo | undefined;
  /** Stable idempotency key for user messages; reused on resubmission. */
  clientMessageId?: string | undefined;
  /** True once the server has confirmed this message (ids are server-issued). */
  persisted?: boolean | undefined;
  /** Active or last generation for assistant messages. */
  generationId?: string | undefined;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** True for clearly labelled demo content. */
  isSample?: boolean;
  /** False until the server has created the conversation. */
  persisted?: boolean;
}

export type PendingAttachmentState = "ready" | "uploading" | "uploaded" | "error";

/** A file picked by the user, before it is sent. */
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  progress: number; // 0-100
  state: PendingAttachmentState;
  error?: string | undefined;
  /** Filled once the upload succeeds, so a resend never re-uploads. */
  uploaded?: UploadedAttachment | undefined;
}

export interface UploadedAttachment {
  attachmentId: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
}

export interface MessageCreatedInfo {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  generationId: string;
  title: string;
}

export interface StreamHandlers {
  onCreated: (info: MessageCreatedInfo) => void;
  onToken: (delta: string) => void;
}

/** How a stream ended. Transports resolve with this rather than throwing. */
export type StreamOutcome =
  | { type: "done"; finishReason: "stop" | "length" }
  | { type: "cancelled" }
  | { type: "error"; error: ChatErrorInfo };

export interface SendMessageInput {
  /** null for a new conversation: the server creates it on the first message. */
  conversationId: string | null;
  clientMessageId: string;
  content: string;
  attachmentIds: string[];
}

/**
 * Contract every reply source satisfies. The demo lives in ./mock; the HTTP
 * transport (src/lib/api/http-transport.ts) talks to the FastAPI backend.
 */
export interface ChatTransport {
  readonly isMock: boolean;
  uploadImage(
    file: File,
    onProgress: (pct: number) => void,
    signal: AbortSignal,
  ): Promise<UploadedAttachment>;
  sendMessage(
    input: SendMessageInput,
    handlers: StreamHandlers,
    signal: AbortSignal,
  ): Promise<StreamOutcome>;
  regenerate(
    assistantMessageId: string,
    handlers: StreamHandlers,
    signal: AbortSignal,
  ): Promise<StreamOutcome>;
  /** Best-effort server-side cancel; the caller also aborts the request. */
  cancel(generationId: string): Promise<void>;
}
