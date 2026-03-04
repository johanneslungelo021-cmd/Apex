import { NextResponse } from 'next/server';
import { chatSessionCounter } from '../../../lib/metrics';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    // Try AI Gateway first (Vercel AI SDK compatible)
    const aiGatewayKey = process.env.AI_GATEWAY_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    let reply = '';

    // Option 1: Use AI Gateway if available
    if (aiGatewayKey) {
      try {
        const res = await fetch('https://gateway.ai.vercel.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiGatewayKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: message }],
            temperature: 0.8,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          reply = data.choices[0]?.message?.content || '';
        }
      } catch {
        console.log('AI Gateway not available, trying Groq...');
      }
    }

    // Option 2: Use Groq API if AI Gateway didn't work
    if (!reply && groqApiKey) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: message }],
            temperature: 0.8,
            max_tokens: 1024,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          reply = data.choices[0]?.message?.content || '';
        }
      } catch {
        console.log('Groq API not available');
      }
    }

    // Emit chat session metric to Grafana
    chatSessionCounter.add(1);

    if (reply) {
      return NextResponse.json({ reply });
    }

    // Fallback response
    return NextResponse.json({
      reply: "I'm the Apex AI Assistant. I can help you with questions about our platform, digital income strategies, and more. Please configure AI_GATEWAY_API_KEY or GROQ_API_KEY for enhanced responses."
    });

  } catch (error) {
    console.error('Assistant API error:', error);
    return NextResponse.json({
      reply: "I encountered an error. Please try again."
    });
  }
}
