import { NextResponse } from 'next/server';
import { chatSessionCounter } from '../../../lib/metrics';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const res = await fetch('http://localhost:8080/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: message }],
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      // Fallback response if LocalAI is not available
      return NextResponse.json({ 
        reply: "I'm here to help! However, it seems the AI backend is not running. Please start LocalAI with: docker run -d -p 8080:8080 localai/localai:latest" 
      });
    }

    const data = await res.json();
    
    // Emit chat session metric to Grafana
    chatSessionCounter.add(1);
    
    return NextResponse.json({ reply: data.choices[0].message.content });
  } catch (error) {
    console.error('Assistant API error:', error);
    return NextResponse.json({ 
      reply: "I'm currently offline. To enable AI responses, please start LocalAI with: docker run -d -p 8080:8080 localai/localai:latest" 
    });
  }
}
