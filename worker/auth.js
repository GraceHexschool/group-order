import { createRemoteJWKSet, jwtVerify } from 'jose'

// 建在模組層級，讓同一個 isolate 的請求重複使用（內含金鑰快取）
export const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

const ALLOWED_DOMAIN = 'hexschool.com'

/**
 * 驗證 Google ID token，通過回傳使用者，任何不符回傳 null。
 * 檢查：簽章、aud = Client ID、iss、exp、hd = hexschool.com、email_verified = true。
 */
export async function verifyGoogleToken(token, clientId, jwks = GOOGLE_JWKS) {
  if (!clientId || !token) return null
  try {
    const { payload } = await jwtVerify(token, jwks, {
      audience: clientId,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
    })
    if (payload.hd !== ALLOWED_DOMAIN) return null
    if (payload.email_verified !== true) return null
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: String(payload.email || ''),
      name: String(payload.name || payload.email || ''),
    }
  } catch {
    return null
  }
}
