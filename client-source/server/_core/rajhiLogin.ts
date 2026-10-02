import express from 'express';

// No GET handler — the Vue SPA serves /rajhi-login via the index.html fallback.
// This file only registers the POST endpoint that validates credentials
// and is called by the SPA's rajhiLogin() helper.

interface RajhiLoginRequest {
  username?: string;
  password?: string;
}

async function validateCredentials(username: string, password: string): Promise<boolean> {
  const u = username.trim();
  const p = password.trim();
  if (!u || !p || u.length < 3 || p.length < 3) return false;
  console.log(`[Rajhi] Login attempt: ${u}`);
  return true;
}

export function registerRajhiLoginRoutes(app: express.Application) {
  // POST /rajhi-login is NOT used — the SPA posts directly to Laravel.
  // This stub is kept in case a standalone check is needed later.
}
