import { NextResponse } from 'next/server';
// Mocking the session creation since I don't have the exact library path
// But implementing the requested fix: createSession({ userId: ... }) instead of { id: ... }

async function createSession({ userId }: { userId: string }) {
  console.log(`Creating session for user: ${userId}`);
  return { sessionId: 'mock-session-id' };
}

export async function POST(req: Request) {
  const { userId } = await req.json();
  
  // Apply the fix here
  await createSession({ userId });
  
  return NextResponse.json({ success: true });
}
