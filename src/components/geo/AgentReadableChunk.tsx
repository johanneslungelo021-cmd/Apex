/**
 * AgentReadableChunk
 *
 * Wraps a block of visible content with an sr-only "answer-first" summary
 * that is:
 *   1. Visible to screen readers (genuine accessibility value)
 *   2. Readable by AI crawlers in the initial HTML response
 *   3. Hidden visually — sighted users see only the rich glassmorphism UI
 *
 * CONTENT PARITY RULE: `agentSummary` MUST accurately represent the visible
 * content of `children`. Never use it to inject keywords that do not reflect
 * what users actually see. Violating this crosses into cloaking territory.
 *
 * The `.geo-answer-first` class on the sr-only element is intentionally
 * referenced by the TechArticle `speakable.cssSelector` in schema-builder.ts,
 * enabling Google Assistant audio readout of these summaries.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/speakable
 * @see https://webaim.org/techniques/css/invisiblecontent/
 * @module components/geo/AgentReadableChunk
 */

import type { ReactNode } from "react";

export interface AgentReadableChunkProps {
  /**
   * Unique identifier for this content block (e.g. "scout-opportunities").
   * Used as the element id so speakable cssSelector can target it specifically
   * if needed.
   */
  id: string;

  /**
   * Answer-first summary of the visible content.
   * Should be 2–3 sentences (20–30 seconds of speech).
   * MUST reflect what users see — no SEO-only keyword injection.
   */
  agentSummary: string;

  /**
   * Human-readable heading for the sr-only summary section.
   * Read aloud by screen readers before the summary text.
   * Defaults to "Section Summary".
   */
  summaryLabel?: string;

  /**
   * The visible content this chunk wraps.
   */
  children: ReactNode;
}

/**
 * AgentReadableChunk
 *
 * Renders `children` normally, preceded by an sr-only summary block.
 * No aria-hidden is set — the sr-only element remains in the accessibility
 * tree, which is the intended behaviour.
 */
export default function AgentReadableChunk({
  id,
  agentSummary,
  summaryLabel = "Section Summary",
  children,
}: AgentReadableChunkProps) {
  return (
    <section aria-labelledby={`${id}-summary-label`}>
      {/*
       * sr-only summary — accessible to screen readers and AI crawlers.
       * The modern clip-path sr-only pattern is used (A11Y Project recommended).
       * aria-hidden is deliberately NOT set here.
       */}
      <div
        id={`${id}-summary`}
        className="geo-answer-first"
        style={{
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          height: "1px",
          width: "1px",
          margin: "-1px",
          overflow: "hidden",
          padding: 0,
          position: "absolute",
          whiteSpace: "nowrap",
        }}
      >
        <span id={`${id}-summary-label`} className="font-semibold">
          {summaryLabel}:{" "}
        </span>
        <span>{agentSummary}</span>
      </div>

      {/* Visible content — unchanged, rendered normally */}
      {children}
    </section>
  );
}
