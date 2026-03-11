/**
 * Auth module index — exports all auth utilities
 * 
 * @module lib/auth
 */

export { findUserByEmail, findUserById, createUser, updateUserProvince, updateLastLogin, getUserCount, type StoredUser } from './store';
export { hashPassword, verifyPassword } from './password';
export { createSession, verifySession, buildSessionCookie, buildLogoutCookie, getTokenFromRequest, type SessionPayload } from './session';
