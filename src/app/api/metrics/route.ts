import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://localhost:8080/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages: [{ 
          role: "user", 
          content: "Return ONLY a valid JSON object with 3 realistic metrics for a digital platform. Format: {\"users\": number, \"impact\": number, \"courses\": number}. Users should be 10000-50000, impact should be 500000-2000000, courses should be 200-500. Return ONLY the JSON, no other text." 
        }]
      })
    });

    if (!res.ok) {
      // Return default metrics if LocalAI is not available
      return NextResponse.json({ 
        users: 12480 + Math.floor(Math.random() * 1000),
        impact: 874200 + Math.floor(Math.random() * 50000),
        courses: 342 + Math.floor(Math.random() * 20)
      });
    }

    const data = await res.json();
    try {
      const parsed = JSON.parse(data.choices[0].message.content);
      return NextResponse.json(parsed);
    } catch {
      // If parsing fails, return default metrics
      return NextResponse.json({ 
        users: 12480 + Math.floor(Math.random() * 1000),
        impact: 874200 + Math.floor(Math.random() * 50000),
        courses: 342 + Math.floor(Math.random() * 20)
      });
    }
  } catch (error) {
    console.error('Metrics API error:', error);
    // Return default metrics on error
    return NextResponse.json({ 
      users: 12480 + Math.floor(Math.random() * 1000),
      impact: 874200 + Math.floor(Math.random() * 50000),
      courses: 342 + Math.floor(Math.random() * 20)
    });
  }
}
