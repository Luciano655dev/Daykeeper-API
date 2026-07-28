const mongoose = require("mongoose")

// A short-lived pending second-factor at login. Created after the password is
// verified when 2FA is enabled and the device is not trusted. Consumed (or
// expired) by POST /auth/2fa/verify. For email OTP we store the code hash; for
// TOTP the code is checked live against the user's secret, so codeHash is null.
const TwoFactorChallengeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    method: { type: String, enum: ["email", "totp"], required: true },
    // "login" challenges complete a sign-in (issue tokens); "setup" challenges
    // confirm email-method enrollment. Kept separate so a setup code can't be
    // replayed against the login-verify endpoint.
    purpose: { type: String, enum: ["login", "setup"], default: "login" },
    codeHash: { type: String, default: null }, // sha256 of the email OTP (email method only)
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    deviceId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
)

// Auto-clean expired challenges.
TwoFactorChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const TwoFactorChallenge = mongoose.model(
  "TwoFactorChallenges",
  TwoFactorChallengeSchema,
  "twoFactorChallenge"
)

module.exports = TwoFactorChallenge
