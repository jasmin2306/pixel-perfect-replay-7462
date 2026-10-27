import type { SseEvent } from "./models";

const KNOWN = new Set(["message.created", "token", "done", "error", "cancelled"]);

/**
 * Incremental SSE parser. Feed decoded text chunks; returns complete events.
 * Comment lines (": ping" heartbeats) and unknown events are ignored.
 */
export function createSseParser() {
  let buffer = "";
  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk.replace(/\r\n/g, "\n");
      const out: SseEvent[] = [];
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
        if (!KNOWN.has(event) || data.length === 0) continue;
        try {
          out.push({ event, data: JSON.parse(data.join("\n")) } as SseEvent);
        } catch {
          // malformed payload: skip; a missing terminal event is handled by the caller
        }
      }
      return out;
    },
  };
}
