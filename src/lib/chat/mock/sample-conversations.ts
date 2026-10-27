/** SAMPLE DATA — illustrative conversations for the Phase 1 UI only. */
import type { Conversation } from "../types";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

export const sampleConversations: Conversation[] = [
  {
    id: "sample-1",
    title: "Receipt total check",
    updatedAt: ago(12),
    isSample: true,
    messages: [
      {
        id: "s1m1",
        role: "user",
        status: "completed",
        persisted: true,
        createdAt: ago(14),
        content: "Can you read the total on this receipt?",
      },
      {
        id: "s1m2",
        role: "assistant",
        status: "completed",
        persisted: true,
        createdAt: ago(13),
        content:
          "Sample reply: the receipt lists 4 items with a total of ₹1,240 including tax. (Illustrative content — no AI was used.)",
      },
    ],
  },
  {
    id: "sample-2",
    title: "Plant leaf spots",
    updatedAt: ago(180),
    isSample: true,
    messages: [
      {
        id: "s2m1",
        role: "user",
        status: "completed",
        createdAt: ago(182),
        content: "What could cause these brown spots?",
      },
      {
        id: "s2m2",
        role: "assistant",
        status: "cancelled",
        persisted: true,
        createdAt: ago(181),
        content: "Sample reply: brown spots with yellow rings often point to",
      },
    ],
  },
  {
    id: "sample-3",
    title: "Whiteboard diagram",
    updatedAt: ago(1500),
    isSample: true,
    messages: [
      {
        id: "s3m1",
        role: "user",
        status: "completed",
        createdAt: ago(1502),
        content: "Turn this whiteboard sketch into a list of steps.",
      },
      {
        id: "s3m2",
        role: "assistant",
        status: "failed",
        createdAt: ago(1501),
        content: "",
        persisted: true,
        error: {
          code: "provider_unavailable",
          message: "Network error while contacting the provider (sample).",
          retryable: true,
        },
      },
    ],
  },
];
