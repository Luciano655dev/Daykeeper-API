const mongoose = require("mongoose")

// A device the user has chosen to "trust" after passing 2FA. While a
// non-expired row exists, that device skips the second factor at login.
// We never store the raw deviceId — only its sha256 hash.
const TrustedDeviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    deviceIdHash: { type: String, required: true, index: true },
    label: { type: String, default: null }, // parsed UA, e.g. "Chrome on macOS"
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

// One trusted entry per (user, device); refreshing trust upserts this pair.
TrustedDeviceSchema.index({ user: 1, deviceIdHash: 1 }, { unique: true })

// Auto-clean expired trusted devices (mirrors RefreshToken's TTL approach).
TrustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const TrustedDevice = mongoose.model(
  "TrustedDevices",
  TrustedDeviceSchema,
  "trustedDevice"
)

module.exports = TrustedDevice
