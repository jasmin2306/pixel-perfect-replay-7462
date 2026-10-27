import { motion } from "framer-motion";
import { AlertTriangle, CircleSlash, RotateCcw } from "lucide-react";
import type { ChatMessage } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";

/** Minimal formatter: **bold** and paragraphs. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="[&:not(:first-child)]:mt-3">
          {para.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="font-semibold">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function MessageBubble({
  message,
  onRetry,
  canRetry,
}: {
  message: ChatMessage;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-end gap-2"
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((a) => (
              <img
                key={a.id}
                src={a.previewUrl}
                alt={a.name}
                className="size-28 rounded-xl border border-border object-cover sm:size-36"
              />
            ))}
          </div>
        )}
        {message.content && (
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-surface-foreground shadow-soft sm:max-w-[75%]">
            {message.content}
          </div>
        )}
      </motion.div>
    );
  }

  const { status } = message;
  const streamingEmpty = status === "streaming" && !message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3"
    >
      <BrandMark className="mt-0.5 size-7 shrink-0 rounded-lg" />
      <div
        className="min-w-0 flex-1 space-y-2"
        aria-live={status === "streaming" ? "polite" : undefined}
      >
        {streamingEmpty ? (
          <div className="flex items-center gap-1.5 py-2" aria-label="Generating reply">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
            <span className="ml-2 text-sm text-muted-foreground">Analyzing…</span>
          </div>
        ) : message.content ? (
          <div
            className={cn(
              "text-[15px] leading-relaxed text-foreground/90",
              status === "streaming" && "streaming-caret",
              status === "cancelled" && "text-muted-foreground",
            )}
          >
            <RichText text={message.content} />
          </div>
        ) : null}

        {status === "cancelled" && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CircleSlash className="size-3.5" /> Generation stopped
            </span>
            {canRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={onRetry}
              >
                <RotateCcw className="size-3.5" /> Regenerate
              </Button>
            )}
          </div>
        )}
        {status === "failed" && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm"
          >
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
            <span className="flex-1 text-foreground/90">
              {message.error?.message ?? "Something went wrong."}
            </span>
            {canRetry && message.error?.retryable !== false && (
              <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={onRetry}>
                <RotateCcw className="size-3.5" /> Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
