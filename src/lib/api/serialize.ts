/** The only place that converts between API snake_case and UI camelCase. */
import type { ChatErrorInfo, ChatMessage, Conversation, ImageAttachment, MessageCreatedInfo, SendMessageInput, UploadedAttachment } from "../chat/types";
import type {
  ApiAttachment, ApiConversationDetail, ApiConversationSummary, ApiErrorBody, ApiMessage,
  ApiSendMessageRequest, ApiUploadResponse, SseMessageCreated,
} from "./models";

export const fromApiError = (e: ApiErrorBody): ChatErrorInfo => ({ code: e.code, message: e.message, retryable: e.retryable });

export const fromApiAttachment = (a: ApiAttachment): ImageAttachment => ({
  id: a.id, name: a.name ?? "image", size: a.size, mimeType: a.mime_type, previewUrl: a.url, width: a.width, height: a.height,
});

export const fromApiUpload = (u: ApiUploadResponse): UploadedAttachment => ({
  attachmentId: u.attachment_id, mimeType: u.mime_type, width: u.width, height: u.height, size: u.size,
});

export const fromApiMessage = (m: ApiMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  status: m.status,
  createdAt: m.created_at,
  attachments: m.attachments.map(fromApiAttachment),
  error: m.error ? fromApiError(m.error) : undefined,
  persisted: true,
});

export const fromApiConversationSummary = (c: ApiConversationSummary): Conversation => ({
  id: c.id, title: c.title, updatedAt: c.updated_at, messages: [], persisted: true,
});

export const fromApiConversationDetail = (c: ApiConversationDetail): Conversation => ({
  ...fromApiConversationSummary(c), messages: c.messages.map(fromApiMessage),
});

export const fromSseMessageCreated = (d: SseMessageCreated): MessageCreatedInfo => ({
  conversationId: d.conversation_id,
  userMessageId: d.user_message_id,
  assistantMessageId: d.assistant_message_id,
  generationId: d.generation_id,
  title: d.title,
});

export const toApiSendMessage = (i: SendMessageInput): ApiSendMessageRequest => ({
  conversation_id: i.conversationId,
  content: i.content,
  attachment_ids: i.attachmentIds,
  client_message_id: i.clientMessageId,
});
