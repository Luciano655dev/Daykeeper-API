const crypto = require("crypto")
const { authenticator } = require("otplib")
const QRCode = require("qrcode")

// Allow a ±1 step (±30s) window so minor clock drift doesn't reject a valid code.
authenticator.options = { window: 1 }

const {
  auth: { twoFactorBackupCodeCount },
} = require("../../constants/index")

// ===== Email OTP (reuses the same sha256 code pattern as email verification) =====

function make6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex")
}

// ===== TOTP (authenticator app: Authy / Google Authenticator) =====

function generateTotpSecret() {
  return authenticator.generateSecret() // base32
}

// otpauth:// URI scanned by authenticator apps. `account` is the user identifier
// shown in the app (we use the email), `issuer` groups it under "Daykeeper".
function buildTotpUri(secret, account, issuer = "Daykeeper") {
  return authenticator.keyuri(account, issuer, secret)
}

async function buildTotpQrDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri)
}

function verifyTotp(secret, token) {
  if (!secret || !token) return false
  try {
    return authenticator.verify({ token: String(token).trim(), secret })
  } catch {
    return false
  }
}

// ===== Backup / recovery codes =====

// Human-friendly one-time codes (e.g. "a1b2-c3d4"). Returned in plaintext ONCE
// at enrollment; only the hashes are persisted.
function generateBackupCodes(count = twoFactorBackupCodeCount) {
  const codes = []
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString("hex") // 8 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return codes
}

// Normalize before hashing so display formatting / case doesn't matter on input.
function hashBackupCode(code) {
  const normalized = String(code).toLowerCase().replace(/[^a-z0-9]/g, "")
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

module.exports = {
  make6DigitCode,
  hashCode,
  generateTotpSecret,
  buildTotpUri,
  buildTotpQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
}
