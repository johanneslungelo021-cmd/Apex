// src/lib/streaming/ndjson.ts
export type StreamEventType = "opportunities" | "chunk" | "done" | "error";

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  data: T;
}

export function parseNdjsonBuffer(
  remainder: string,
  incoming: string,
): { events: StreamEvent[]; remainder: string } {
  const text = remainder + incoming;
  const lines = text.split("\n");
  const nextRemainder = lines.pop() ?? "";

  const events: StreamEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { type?: unknown }).type === "string" &&
        "data" in parsed
      ) {
        events.push(parsed as StreamEvent);
      }
    } catch {
      // ignore malformed line
    }
  }

  return { events, remainder: nextRemainder };
}
