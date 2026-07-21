const crypto = require("crypto")
const RefreshToken = require("../models/RefreshToken")
const TrustedDevice = require("../models/TrustedDevice")
const {
  auth: { trustedDeviceExpiresTime },
} = require("../../constants/index")

function hashDeviceId(deviceId) {
  return crypto.createHash("sha256").update(String(deviceId)).digest("hex")
}

// A device is "known" for a user if we've ever issued a refresh token for that
// deviceId — i.e. they've successfully signed in from it before. Used to decide
// whether to fire a new-device login alert.
async function isKnownDevice(userId, deviceId) {
  if (!deviceId) return false
  const existing = await RefreshToken.findOne({
    user: userId,
    deviceId,
  }).select("_id")
  return Boolean(existing)
}

// A device is "trusted" if the user explicitly chose to trust it and that trust
// has not expired. Trusted devices skip 2FA at login.
async function isDeviceTrusted(userId, deviceId) {
  if (!deviceId) return false
  const row = await TrustedDevice.findOne({
    user: userId,
    deviceIdHash: hashDeviceId(deviceId),
    expiresAt: { $gt: new Date() },
  }).select("_id")
  return Boolean(row)
}

// Upsert a trusted-device record, refreshing its expiry/metadata. No-op if no
// deviceId is supplied (e.g. a client that doesn't send one).
async function trustDevice({ userId, deviceId, ip, userAgent, label }) {
  if (!deviceId) return null
  const expiresAt = new Date(Date.now() + trustedDeviceExpiresTime)
  await TrustedDevice.updateOne(
    { user: userId, deviceIdHash: hashDeviceId(deviceId) },
    {
      $set: {
        ip: ip || null,
        userAgent: userAgent || null,
        label: label || null,
        lastUsedAt: new Date(),
        expiresAt,
      },
    },
    { upsert: true }
  )
  return expiresAt
}

// Lightweight UA -> "Browser on OS" / device label. No external dependency: a
// few ordered regexes cover the common cases; falls back to the raw UA.
function parseUserAgent(ua) {
  if (!ua) return "Unknown device"

  let os = "Unknown OS"
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS"
  else if (/Windows/i.test(ua)) os = "Windows"
  else if (/Linux/i.test(ua)) os = "Linux"

  let browser = null
  if (/Expo|Daykeeper/i.test(ua)) browser = "Daykeeper app"
  else if (/Edg\//i.test(ua)) browser = "Edge"
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera"
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome"
  else if (/Firefox\//i.test(ua)) browser = "Firefox"
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari"

  return browser ? `${browser} on ${os}` : os
}

module.exports = {
  hashDeviceId,
  isKnownDevice,
  isDeviceTrusted,
  trustDevice,
  parseUserAgent,
}
