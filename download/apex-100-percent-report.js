const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, 
        AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, 
        VerticalAlign, PageNumber, PageBreak, TableOfContents, ExternalHyperlink } = require('docx');
const fs = require('fs');

// Midnight Code color palette
const colors = {
  primary: "020617",      // Midnight Black
  body: "1E293B",         // Deep Slate Blue
  secondary: "64748B",    // Cool Blue-Gray
  accent: "94A3B8",       // Steady Silver
  tableBg: "F8FAFC",      // Glacial Blue-White
  white: "FFFFFF"
};

const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: colors.secondary };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Times New Roman", size: 24 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 72, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 0, after: 200 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: colors.body, font: "Times New Roman" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: colors.secondary, font: "Times New Roman" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
    ]
  },
  numbering: {
    config: [
      { reference: "bullet-list", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-5", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
    ]
  },
  sections: [
    // COVER PAGE
    {
      properties: { page: { margin: { top: 0, right: 0, bottom: 0, left: 0 } } },
      children: [
        new Paragraph({ spacing: { before: 6000 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "APEX SENTIENT INTERFACE", size: 72, bold: true, color: colors.primary, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "AI-Powered Digital Income Platform for South Africa", size: 32, color: colors.secondary, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "100% Functionality Blueprint", size: 28, italics: true, color: colors.body, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2000 },
          children: [new TextRun({ text: "Built in the Vaal Triangle, Gauteng, South Africa", size: 22, color: colors.accent, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Version 4.0.0-pillar4", size: 20, color: colors.accent, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }), size: 20, color: colors.accent, font: "Times New Roman" })]
        })
      ]
    },
    // MAIN CONTENT
    {
      properties: { page: { margin: { top: 1800, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({ children: [new Paragraph({ 
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Apex Sentient Interface | 100% Functionality Blueprint", size: 18, color: colors.secondary, font: "Times New Roman" })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ 
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Page ", size: 18, font: "Times New Roman" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Times New Roman" }), new TextRun({ text: " of ", size: 18, font: "Times New Roman" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: "Times New Roman" })]
        })] })
      },
      children: [
        // TABLE OF CONTENTS
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Table of Contents")] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
          children: [new TextRun({ text: "Note: Right-click the Table of Contents and select \"Update Field\" to refresh page numbers.", size: 18, color: "999999", italics: true, font: "Times New Roman" })]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // EXECUTIVE SUMMARY
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Executive Summary")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "Apex Central is a sophisticated AI-powered digital income platform designed specifically for South African creators and entrepreneurs. Built in the Vaal Triangle, Gauteng, the platform represents a convergence of cutting-edge technologies including WebGL visualisations, multi-model AI orchestration, real-time market intelligence, and secure blockchain transactions. This document provides a comprehensive blueprint of what the system looks like when operating at 100% functionality, serving as both a technical reference and an operational guide.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The platform is architected around five interconnected pillars, each representing a critical dimension of the system's capabilities. When all pillars function at optimal capacity, users experience a seamless, responsive, and intelligent platform that actively helps them discover and pursue digital income opportunities. The system is designed with South African context at its core, incorporating local market data, South African news feeds, province-specific economic insights, and support for the ZAR economy.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "At 100% functionality, the platform delivers personalised opportunity discovery through the Scout Agent, real-time conversational AI assistance through the Intelligent Engine, and secure micro-transaction settlement through XRPL orchestration. The user interface responds dynamically to user presence and emotional state, creating a truly sentient digital experience that adapts and evolves with each interaction.", font: "Times New Roman", size: 24 })]
        }),

        // SYSTEM ARCHITECTURE
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("System Architecture Overview")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The Apex platform is built on Next.js 16 with the App Router architecture, deployed on Vercel's edge network with a Cape Town (cpt1) region configuration. This ensures optimal performance for South African users with minimal latency. The technology stack has been carefully selected to balance performance, developer experience, and production reliability:", font: "Times New Roman", size: 24 })]
        }),

        // Tech Stack Table
        new Table({
          columnWidths: [3120, 6240],
          alignment: AlignmentType.CENTER,
          margins: { top: 100, bottom: 100, left: 180, right: 180 },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Category", bold: true, size: 22, font: "Times New Roman" })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Technology Stack", bold: true, size: 22, font: "Times New Roman" })] })] })
              ]
            }),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Framework", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Next.js 16 (App Router)", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Language", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "TypeScript", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Styling", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Tailwind CSS", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "3D/WebGL", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "React Three Fiber + Drei + Three.js", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Animations", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Framer Motion", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AI - Simple Chat", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Groq (llama-3.1-8b-instant)", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AI - Complex Analysis", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Kimi K2 via Moonshot AI", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AI - Research", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Perplexity Sonar", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Observability", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "OpenTelemetry to Grafana Cloud", size: 22, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3120, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Deployment", size: 22, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6240, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Vercel Hobby (Cape Town cpt1)", size: 22, font: "Times New Roman" })] })] })
            ]})
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 400 },
          children: [new TextRun({ text: "Table 1: Core Technology Stack", size: 18, italics: true, color: colors.secondary, font: "Times New Roman" })]
        }),

        // THE FIVE PILLARS
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("The Five Pillars of Apex")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The Apex platform is constructed around five foundational pillars, each representing a critical architectural dimension. When all five pillars operate at full capacity, the system achieves its intended vision of a sentient, responsive, and intelligent platform for South African digital income seekers.", font: "Times New Roman", size: 24 })]
        }),

        // PILLAR 1
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Pillar 1: The Sentient Vessel")] }),
        new Paragraph({
          spacing: { after: 150, line: 312 },
          children: [new TextRun({ text: "The Sentient Vessel represents the visual and sensory soul of the Apex platform. At its core lies the EmotionalSwarm, a WebGL-powered particle system that responds dynamically to user interactions, creating an organic, living canvas that evolves with each session. This is not mere decoration, but an intentional design philosophy rooted in African Futurism, where technology responds and adapts to human presence rather than remaining static and impersonal.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Components at 100% Functionality:", bold: true, size: 24, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "EmotionalSwarm: WebGL particle swarm with thousands of particles animating smoothly at 60fps, responding to cursor movement and emotional state transitions", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "EmotionalGrid: CSS variable morphing wrapper that creates subtle background colour transitions based on emotional context", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "MagneticReticle: Custom cursor with spring physics that follows user input with organic, fluid movement", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "SensoryControls: Accessibility toggles for audio, haptics, and motion preferences, stored in localStorage", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "ReducedMotionGate: Intelligent gate that skips Three.js rendering for users with reduced-motion preferences", font: "Times New Roman", size: 24 })] }),

        // PILLAR 2
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Pillar 2: GEO + SA Intelligence")] }),
        new Paragraph({
          spacing: { after: 150, line: 312 },
          children: [new TextRun({ text: "Pillar 2 establishes the platform's deep connection to South African context through geographical intelligence and real-time data feeds. The system is designed to serve South African users specifically, with South African news, market data, and province-specific economic insights. This pillar powers the news aggregation, province economic panels, and Text-to-Speech capabilities.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Features at 100% Functionality:", bold: true, size: 24, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Live SA News: Perplexity Sonar-powered news aggregation with 10-minute cache, filtering for South African headlines from trusted sources", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Province Economic Panel: Interactive selector for all nine SA provinces with census data and economic indicators", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Text-to-Speech: Web Speech API integration with South African accent preferences, enabling auditory consumption of AI responses", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "JSON-LD Schema: Structured data injection for search engine optimisation, enabling AI assistants to understand platform context", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "Agent Classifier: Middleware that detects AI assistants, search crawlers, and data scrapers, serving appropriate content format", font: "Times New Roman", size: 24 })] }),

        // PILLAR 3
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Pillar 3: The Heart - Identity & Empathy")] }),
        new Paragraph({
          spacing: { after: 150, line: 312 },
          children: [new TextRun({ text: "The Heart pillar establishes Apex's unique personality and emotional intelligence. Through the Identity Matrix, Empathy Engine, and Code Switch components, the platform maintains a consistent, authentic voice while adapting to user context and emotional state. This is not simply about tone, but about creating genuine connection and trust with South African users.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Core Systems at 100% Functionality:", bold: true, size: 24, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Identity Matrix: Central persona definition ensuring consistent voice, values, and messaging across all interactions", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Empathy Engine: Response enrichment layer that adds emotional context and supportive language based on detected user sentiment", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Code Switch: SA language adaptation supporting code-switching between English, Afrikaans, Zulu, and other local languages", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Sentiment Analysis: Hugging Face-powered or local sentiment detection for understanding user emotional state", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "Tone Validation: Apex Identity Middleware ensuring all AI responses align with platform values before delivery to users", font: "Times New Roman", size: 24 })] }),

        // PILLAR 4
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Pillar 4: The Bones - Security & Observability")] }),
        new Paragraph({
          spacing: { after: 150, line: 312 },
          children: [new TextRun({ text: "Pillar 4 provides the structural integrity of the platform through comprehensive security headers, rate limiting, and production-grade observability. This pillar ensures the platform remains secure, performant, and debuggable in production environments. All security measures are implemented at the middleware level, ensuring consistent protection across all routes.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Security & Monitoring at 100% Functionality:", bold: true, size: 24, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Security Headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP, and HSTS implemented", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Rate Limiting: Per-route rate limits with configurable thresholds and IP pseudonymisation for privacy-compliant logging", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "OpenTelemetry Integration: Comprehensive instrumentation with custom counters for page views, registrations, chat sessions, and more", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Grafana Cloud Dashboards: Pre-built dashboards for AI Agent metrics, usage insights, and performance monitoring", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "Health Check Endpoint: /api/health providing service status, OTEL connectivity, and AI key validation", font: "Times New Roman", size: 24 })] }),

        // PILLAR 5
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Pillar 5: Speed Insights")] }),
        new Paragraph({
          spacing: { after: 150, line: 312 },
          children: [new TextRun({ text: "Pillar 5 focuses on performance optimisation with specific attention to Core Web Vitals metrics including First Contentful Paint (FCP), Largest Contentful Paint (LCP), and Interaction to Next Paint (INP). The platform implements layered caching, lazy loading, and intelligent code splitting to ensure optimal performance for South African users on varying connection speeds.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Performance Optimisations at 100%:", bold: true, size: 24, font: "Times New Roman" })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "CDN Caching: Layered caching headers for department APIs with stale-while-revalidate patterns", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Lazy Three.js Loading: Deferred WebGL initialisation using setTimeout to prevent main thread blocking", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "Brotli Compression: Server-side compression achieving 15-25% improvement over gzip for JS bundles", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "AVIF Image Optimisation: 40-50% smaller than JPEG for news article thumbnails", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "Vercel Speed Insights: Real-time performance monitoring with Cape Town edge region for minimal SA latency", font: "Times New Roman", size: 24 })] }),

        // USER EXPERIENCE
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("User Experience at 100% Functionality")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "When operating at full capacity, the Apex platform delivers a distinctive user experience that combines aesthetic beauty with functional intelligence. The following walkthrough describes what a user experiences when the system functions at 100%:", font: "Times New Roman", size: 24 })]
        }),

        // Landing Experience
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Initial Landing Experience")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "Upon navigating to the Apex platform, the user is greeted by a mesmerising WebGL particle swarm that responds to cursor movement. The particles drift organically, creating an ambient visual atmosphere that immediately signals this is not a typical web application. The MagneticReticle cursor follows user input with spring physics, creating a tactile sense of connection. Within milliseconds, the SensoryControls appear, allowing users to customise their experience with audio, haptics, and motion preferences. The page loads in under 2 seconds on a 4G connection, with the Three.js scene deferred to prevent main thread blocking.", font: "Times New Roman", size: 24 })]
        }),

        // AI Interaction
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("AI-Powered Interaction")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "When the user interacts with the AI assistant, the system routes the query through a tiered model selection process. Simple queries receive responses from Groq's llama-3.1-8b-instant model in under 500ms. Complex queries requiring deep analysis are routed to Kimi K2 for comprehensive responses. Research queries trigger Perplexity Sonar, which searches the live web for current South African information. All responses are enriched by the Empathy Engine and validated against the Identity Matrix before delivery. The response streams in real-time using NDJSON format, providing immediate feedback as content generates.", font: "Times New Roman", size: 24 })]
        }),

        // Opportunity Discovery
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Opportunity Discovery Flow")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The Scout Agent continuously scans for digital income opportunities relevant to South Africans, filtering for opportunities with startup costs between R0 and R2000. When a user visits the Opportunities section, they see personalised recommendations based on their interaction history and stated preferences. Each opportunity includes clear categorisation (Freelancing, E-commerce, Content Creation, Online Tutoring, Digital Skills), estimated startup cost, potential earnings, and step-by-step getting started guides. The Research button on each opportunity triggers the AI to provide deeper analysis and local context.", font: "Times New Roman", size: 24 })]
        }),

        // API ENDPOINTS
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("API Endpoints at 100% Functionality")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The platform exposes a comprehensive set of API endpoints that power both the frontend interface and external integrations. Each endpoint is designed for reliability, appropriate caching, and graceful error handling:", font: "Times New Roman", size: 24 })]
        }),

        // API Table
        new Table({
          columnWidths: [2800, 1200, 5360],
          alignment: AlignmentType.CENTER,
          margins: { top: 100, bottom: 100, left: 180, right: 180 },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Endpoint", bold: true, size: 22, font: "Times New Roman" })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Method", bold: true, size: 22, font: "Times New Roman" })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Description", bold: true, size: 22, font: "Times New Roman" })] })] })
              ]
            }),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/health", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GET", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Service health status with OTEL and AI key validation", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/ai-agent", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POST", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Streaming AI chat with tiered model routing", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/news", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GET", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Live SA news via Perplexity Sonar, 10-min cache", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/metrics", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GET", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Real GitHub repository metrics (stars, forks, issues)", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/analytics", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "POST", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Fire-and-forget page view counter with OTEL", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 2800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "/api/mx/[slug]", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 1200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "GET", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 5360, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "GEO markdown shadow-route for AI assistants", size: 20, font: "Times New Roman" })] })] })
            ]})
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 400 },
          children: [new TextRun({ text: "Table 2: Primary API Endpoints", size: 18, italics: true, color: colors.secondary, font: "Times New Roman" })]
        }),

        // CONFIGURATION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Configuration Requirements")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "For the system to operate at 100% functionality, the following environment variables must be configured in Vercel's dashboard. These are distinct from GitHub Repository Secrets and must be added separately to the Vercel project settings:", font: "Times New Roman", size: 24 })]
        }),

        // Environment Variables Table
        new Table({
          columnWidths: [3200, 6160],
          alignment: AlignmentType.CENTER,
          margins: { top: 100, bottom: 100, left: 180, right: 180 },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Variable", bold: true, size: 22, font: "Times New Roman" })] })] }),
                new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Purpose", bold: true, size: 22, font: "Times New Roman" })] })] })
              ]
            }),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "GROQ_API_KEY", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Groq API key for llama-3.1-8b-instant and llama-3.3-70b models", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "PERPLEXITY_API_KEY", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Perplexity Sonar for live SA news and Scout Agent research", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "MPC_APEX / KIMI_API_KEY", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Kimi K2 via Moonshot AI for complex query analysis", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "GITHUB_TOKEN", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "GitHub PAT for repository metrics (5000 vs 60 req/hr)", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "AUTH_SECRET", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Session authentication secret for user login system", size: 20, font: "Times New Roman" })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "GRAFANA_* variables", size: 20, font: "Times New Roman" })] })] }),
              new TableCell({ borders: cellBorders, width: { size: 6160, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "OTEL endpoint, instance ID, and API key for Grafana Cloud", size: 20, font: "Times New Roman" })] })] })
            ]})
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 400 },
          children: [new TextRun({ text: "Table 3: Required Environment Variables", size: 18, italics: true, color: colors.secondary, font: "Times New Roman" })]
        }),

        // METRICS
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Grafana Metrics at 100%")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "When properly configured, the platform exports comprehensive metrics to Grafana Cloud via OpenTelemetry. These metrics provide real-time visibility into platform performance, user behaviour, and AI model efficiency. The following metrics are available for monitoring and alerting:", font: "Times New Roman", size: 24 })]
        }),

        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_page_view_total: Page view counter with route and province labels", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_registration_total: User registration counter", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_chat_session_total: AI chat session counter by status", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_scout_run_total: Scout Agent runs by success/error status", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_agent_query_total: AI queries by tier (simple/complex/research) and model", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_inference_latency_ms: Inference latency histogram for performance tracking", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 80, line: 312 }, children: [new TextRun({ text: "apex_rate_limit_total: Rate-limited requests by route for abuse detection", font: "Times New Roman", size: 24 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, spacing: { after: 200, line: 312 }, children: [new TextRun({ text: "apex_ssrf_block_total: SSRF attempts blocked by security middleware", font: "Times New Roman", size: 24 })] }),

        // CONCLUSION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Achieving 100% Functionality")] }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The Apex Sentient Interface represents a sophisticated integration of modern web technologies, AI capabilities, and South African contextual intelligence. When all five pillars operate at full capacity, the platform delivers a unique digital experience that helps South African creators discover and pursue sustainable digital income opportunities. The sentient interface responds to human presence, the AI provides intelligent guidance grounded in local context, and the infrastructure ensures security, reliability, and observability.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "Achieving 100% functionality requires careful attention to environment configuration, particularly the distinction between GitHub Repository Secrets and Vercel Environment Variables. Once properly configured, the platform automatically deploys from the main branch to Vercel's Cape Town edge region, providing optimal latency for South African users.", font: "Times New Roman", size: 24 })]
        }),
        new Paragraph({
          spacing: { after: 200, line: 312 },
          children: [new TextRun({ text: "The platform is designed for continuous evolution, with each pillar providing clear extension points for future enhancements. The architecture supports additional AI models, new data sources, enhanced accessibility features, and expanded XRPL transaction capabilities. As the platform grows, the five pillars ensure that new features integrate seamlessly with existing functionality, maintaining the coherent experience that defines the Apex Sentient Interface.", font: "Times New Roman", size: 24 })]
        }),

        // Platform URL
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [
            new TextRun({ text: "Platform URL: ", size: 22, color: colors.secondary, font: "Times New Roman" }),
            new ExternalHyperlink({
              children: [new TextRun({ text: "https://apex-coral-zeta.vercel.app", style: "Hyperlink", size: 22, font: "Times New Roman" })],
              link: "https://apex-coral-zeta.vercel.app"
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100 },
          children: [
            new TextRun({ text: "Repository: ", size: 22, color: colors.secondary, font: "Times New Roman" }),
            new ExternalHyperlink({
              children: [new TextRun({ text: "https://github.com/johanneslungelo021-cmd/Apex", style: "Hyperlink", size: 22, font: "Times New Roman" })],
              link: "https://github.com/johanneslungelo021-cmd/Apex"
            })
          ]
        })
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/z/my-project/download/Apex_100_Percent_Functionality_Blueprint.docx", buffer);
  console.log("Document created: /home/z/my-project/download/Apex_100_Percent_Functionality_Blueprint.docx");
});
