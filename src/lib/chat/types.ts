export type MessageRole = "user" | "assistant";

/** Lifecycle of an assistant reply. User messages are always "completed". */
export type MessageStatus = "streaming" | "completed" | "cancelled" | "failed";

export interface ImageAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** Object URL or remote URL used for display. */
  previewUrl: string;
  width?: number;
  height?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  attachments?: ImageAttachment[];
  error?: string | undefined;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** True for clearly labelled demo content. */
  isSample?: boolean;
}

/** A file picked by the user, before it is sent. */
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  progress: number; // 0-100
  state: "ready" | "uploading" | "uploaded" | "error";
  error?: string | undefined;
}

/**
 * Contract any reply source must satisfy. The mock lives in ./mock; the
 * future FastAPI SSE client will implement this same interface.
 */
export interface ChatTransport {
  readonly isMock: boolean;
  uploadImage(file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<void>;
  streamReply(
    input: { conversationId: string; prompt: string; hasImages: boolean },
    onToken: (token: string) => void,
    signal: AbortSignal,
  ): Promise<void>;
}
