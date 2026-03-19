import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  const { event, data } = body;

  if (event === 'charge.success') {
    // Correct column name: external_id instead of reference
    const externalId = data.reference; 
    console.log(`Processing Paystack webhook for external_id: ${externalId}`);
    
    // Treasury split logic would go here
    // Split ZAR payments into Vaal Development Pool and update creator.total_earnings
  }

  return NextResponse.json({ received: true });
}
