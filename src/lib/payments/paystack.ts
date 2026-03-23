/**
 * Paystack Payment Integration for South African ZAR Payments
 *
 * Primary payment gateway for Apex creator platform supporting:
 * - Card payments (Visa, Mastercard)
 * - Bank transfers (EFT)
 * - Instant EFT (Ozow integration)
 * - USSD for mobile users
 *
 * Market Coverage: 95% of SA target users reachable
 *
 * Setup:
 * 1. Get API keys from Paystack Dashboard (https://dashboard.paystack.com)
 * 2. Set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY in environment
 * 3. Configure webhook endpoint in Paystack dashboard
 *
 * @module lib/payments/paystack
 */

import { log, generateRequestId } from '@/lib/api-utils';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeRequest {
  email: string;
  amount: number; // In ZAR (will be converted to kobo/cents)
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
  channels?: ('card' | 'bank_transfer' | 'eft' | 'ussd' | 'mobile_money')[];
  currency?: 'ZAR' | 'NGN' | 'GHS' | 'USD';
}

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: 'success' | 'failed' | 'abandoned' | 'pending';
    reference: string;
    amount: number; // In kobo/cents
    message?: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: 'card' | 'bank_transfer' | 'eft' | 'ussd';
    currency: string;
    ip_address: string;
    metadata: Record<string, unknown>;
    log: {
      history: Array<{
        type: string;
        message: string;
        time: number;
      }>;
    };
    fees: number;
    fees_split: {
      paystack: number;
      merchant: number;
    };
    authorization?: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
    };
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone?: string;
    };
  };
}

export interface PaystackTransferRecipient {
  type: 'nuban' | 'mobile_money';
  name: string;
  account_number: string;
  bank_code: string;
  currency?: 'ZAR' | 'NGN' | 'GHS';
}

export interface PaystackTransfer {
  source: 'balance';
  amount: number;
  recipient: string;
  reason?: string;
  reference?: string;
}

/**
 * Initialize a Paystack payment transaction
 *
 * @param params - Payment parameters
 * @returns Payment initialization response with redirect URL
 */
export async function initializePaystackPayment(
  params: PaystackInitializeRequest
): Promise<PaystackInitializeResponse> {
  const requestId = generateRequestId();
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  // Convert ZAR to kobo (cents) - Paystack expects amount in smallest currency unit
  const amountInKobo = Math.round(params.amount * 100);

  const payload = {
    email: params.email,
    amount: amountInKobo,
    reference: params.reference || `apex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    callback_url: params.callback_url || `${process.env.NEXT_PUBLIC_URL}/api/webhooks/paystack/callback`,
    metadata: {
      ...params.metadata,
      platform: 'apex',
      requestId,
    },
    channels: params.channels || ['card', 'bank_transfer', 'eft', 'ussd'],
    currency: params.currency || 'ZAR',
  };

  log({
    level: 'info',
    service: 'paystack',
    message: 'Initializing payment',
    requestId,
    email: params.email,
    amount: params.amount,
    reference: payload.reference,
  });

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log({
      level: 'error',
      service: 'paystack',
      message: 'Paystack initialization failed',
      requestId,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Paystack initialization failed: ${response.status}`);
  }

  const result: PaystackInitializeResponse = await response.json();

  log({
    level: 'info',
    service: 'paystack',
    message: 'Payment initialized successfully',
    requestId,
    reference: result.data.reference,
  });

  return result;
}

/**
 * Verify a Paystack payment transaction
 *
 * @param reference - Transaction reference to verify
 * @returns Verification response with transaction details
 */
export async function verifyPaystackPayment(
  reference: string
): Promise<PaystackVerifyResponse> {
  const requestId = generateRequestId();
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  log({
    level: 'info',
    service: 'paystack',
    message: 'Verifying payment',
    requestId,
    reference,
  });

  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    log({
      level: 'error',
      service: 'paystack',
      message: 'Paystack verification failed',
      requestId,
      status: response.status,
      error: errorText,
    });
    throw new Error(`Paystack verification failed: ${response.status}`);
  }

  const result: PaystackVerifyResponse = await response.json();

  log({
    level: 'info',
    service: 'paystack',
    message: 'Payment verification complete',
    requestId,
    reference,
    status: result.data?.status,
    amount: result.data?.amount ? result.data.amount / 100 : 0,
  });

  return result;
}

/**
 * Create a transfer recipient for creator payouts
 *
 * @param recipient - Bank account details for the recipient
 * @returns Recipient code for transfers
 */
export async function createTransferRecipient(
  recipient: PaystackTransferRecipient
): Promise<{ recipient_code: string }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transferrecipient`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: recipient.type,
      name: recipient.name,
      account_number: recipient.account_number,
      bank_code: recipient.bank_code,
      currency: recipient.currency || 'ZAR',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create transfer recipient: ${errorText}`);
  }

  const result = await response.json();
  return { recipient_code: result.data.recipient_code };
}

/**
 * Initiate a transfer to a creator's bank account
 *
 * @param transfer - Transfer details
 * @returns Transfer reference
 */
export async function initiatePaystackTransfer(
  transfer: PaystackTransfer
): Promise<{ transfer_code: string; reference: string }> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: transfer.source,
      amount: Math.round(transfer.amount * 100), // Convert to kobo
      recipient: transfer.recipient,
      reason: transfer.reason || 'Apex Creator Payout',
      reference: transfer.reference || `apex_payout_${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to initiate transfer: ${errorText}`);
  }

  const result = await response.json();
  return {
    transfer_code: result.data.transfer_code,
    reference: result.data.reference,
  };
}

/**
 * Calculate Paystack transaction fees
 *
 * Paystack SA fees (as of 2026):
 * - Card payments: 2.9% + R2.50 (excl VAT)
 * - Instant EFT: 1.9% + R1.50
 * - Bank transfer: R10 flat fee
 *
 * @param amount - Transaction amount in ZAR
 * @param channel - Payment channel
 * @returns Fee breakdown
 */
export function calculatePaystackFees(
  amount: number,
  channel: 'card' | 'bank_transfer' | 'eft' = 'card'
): {
  paystackFee: number;
  vat: number;
  totalFee: number;
  creatorReceives: number;
} {
  let paystackFee: number;
  const vatRate = 0.15; // 15% VAT on fees

  switch (channel) {
    case 'card':
      paystackFee = (amount * 0.029) + 2.50;
      break;
    case 'eft':
      paystackFee = (amount * 0.019) + 1.50;
      break;
    case 'bank_transfer':
      paystackFee = 10.00;
      break;
    default:
      paystackFee = (amount * 0.029) + 2.50;
  }

  const vat = paystackFee * vatRate;
  const totalFee = paystackFee + vat;
  const creatorReceives = amount - totalFee;

  return {
    paystackFee: Math.round(paystackFee * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    totalFee: Math.round(totalFee * 100) / 100,
    creatorReceives: Math.max(0, Math.round(creatorReceives * 100) / 100),
  };
}

/**
 * Get list of South African banks for bank transfer payments
 */
export async function getSouthAfricanBanks(): Promise<Array<{ code: string; name: string }>> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  const response = await fetch(`${PAYSTACK_BASE_URL}/bank?currency=ZAR`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch bank list');
  }

  const result = await response.json();
  return result.data.map((bank: { code: string; name: string }) => ({
    code: bank.code,
    name: bank.name,
  }));
}

/**
 * Generate a Paystack signature for webhook verification
 */
export function generatePaystackSignature(payload: string): string {
  const crypto = require('crypto');
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  return crypto
    .createHmac('sha512', secretKey)
    .update(payload)
    .digest('hex');
}

/**
 * Verify webhook signature from Paystack
 */
export function verifyPaystackWebhook(
  signature: string,
  payload: string
): boolean {
  const expectedSignature = generatePaystackSignature(payload);
  return signature === expectedSignature;
}
