export const runtime = "nodejs";

/**
 * Full Registration — email + password + display name
 *
 * Uses the same PII-safe logging pattern (SHA-256 hash) and
 * structured logging from api-utils. Rate limited to prevent abuse.
 *
 * @module api/auth/register
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { generateRequestId, log, checkRateLimit } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth/password";
import { createSession, buildSessionCookie } from "@/lib/auth/session";
import { findUserByEmail, createUser, type StoredUser } from "@/lib/auth/store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SERVICE = "auth-register";

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Rate limit: 5 registrations per 15 minutes per IP
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000)) {
    log({
      level: "warn",
      service: SERVICE,
      message: "Rate limit exceeded",
      requestId,
    });
    return NextResponse.json(
      {
        success: false,
        error: "RATE_LIMITED",
        message: "Too many attempts. Try again in 15 minutes.",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Request body must be a JSON object.",
      },
      { status: 400 },
    );
  }

  const { email, password, displayName } = body as Record<string, unknown>;

  // Validate email
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Email is required.",
      },
      { status: 400 },
    );
  }
  const normalizedEmail = email.toLowerCase().trim();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Email format is invalid.",
      },
      { status: 400 },
    );
  }

  // Validate password
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters.",
      },
      { status: 400 },
    );
  }
  if (password.length > 128) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Password must be 128 characters or fewer.",
      },
      { status: 400 },
    );
  }

  // Validate display name
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (!name || name.length < 2 || name.length > 50) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Display name must be 2–50 characters.",
      },
      { status: 400 },
    );
  }

  try {
    // Optimistic duplicate check (best-effort — not a hard guarantee).
    // A concurrent registration may pass this check and hit the DB constraint;
    // that race is handled in the catch block below.
    if (await findUserByEmail(normalizedEmail)) {
      await hashPassword(password); // timing-safe: prevent email enumeration
      return NextResponse.json(
        {
          success: false,
          error: "DUPLICATE_EMAIL",
          message: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }

    // Create user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    const newUser: StoredUser = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      displayName: name,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      province: null,
    };

    await createUser(newUser);

    // Issue session JWT
    const token = await createSession({
      userId,
      email: normalizedEmail,
      displayName: name,
    });

    // PII-safe logging
    const hash = crypto
      .createHash("sha256")
      .update(normalizedEmail)
      .digest("hex")
      .slice(0, 12);
    log({
      level: "info",
      service: SERVICE,
      message: `New user registered: user_${hash}`,
      requestId,
    });

    // Return success + set HttpOnly session cookie
    const response = NextResponse.json({
      success: true,
      message: "Welcome to Apex! Your account has been created.",
      user: {
        id: userId,
        email: normalizedEmail,
        displayName: name,
      },
    });
    response.headers.set("Set-Cookie", buildSessionCookie(token));
    return response;
  } catch (error) {
    // Handle the TOCTOU race: two concurrent requests may both pass the
    // findUserByEmail check above, then the second createUser hits the DB
    // unique constraint and throws DUPLICATE_EMAIL. Return 409, not 500.
    if (error instanceof Error && error.message === "DUPLICATE_EMAIL") {
      return NextResponse.json(
        {
          success: false,
          error: "DUPLICATE_EMAIL",
          message: "An account with this email already exists.",
        },
        { status: 409 },
      );
    }

    log({
      level: "error",
      service: SERVICE,
      message: `Registration failed: ${error instanceof Error ? error.message : "Unknown"}`,
      requestId,
    });
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Registration failed. Please try again.",
      },
      { status: 500 },
    );
  }
}
