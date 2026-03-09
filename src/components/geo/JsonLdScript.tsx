/**
 * JsonLdScript
 *
 * Server-side component that injects a schema.org JSON-LD <script> tag.
 * Rendered server-side in layout.tsx and page-level generateMetadata to
 * ensure AI crawlers without full JavaScript execution receive structured
 * data in the initial HTML response.
 *
 * @module components/geo/JsonLdScript
 */

interface JsonLdScriptProps {
  schema: Record<string, unknown>;
  /** Optional nonce for CSP compliance */
  nonce?: string;
}

/**
 * Renders a <script type="application/ld+json"> tag with the provided schema.
 * Must be used in Server Components or inside <head> via Next.js metadata.
 */
export default function JsonLdScript({ schema, nonce }: JsonLdScriptProps) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // dangerouslySetInnerHTML is safe here because the schema is built
      // server-side from our own schema-builder — no user input reaches it.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
