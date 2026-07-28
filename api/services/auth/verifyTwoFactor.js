const User = require("../../models/User")
const TwoFactorChallenge = require("../../models/TwoFactorChallenge")
const login = require("./login")
const {
  hashCode,
  verifyTotp,
  hashBackupCode,
} = require("../../utils/twoFactor")
const { trustDevice, parseUserAgent } = require("../../utils/deviceTrust")

const {
  errors: { notFound, unauthorized, fieldNotFilledIn, invalidValue },
  auth: { maxTwoFactorAttempts },
} = require("../../../constants/index")

// Completes a login that was put on hold by a 2FA challenge. On success it mints
// tokens via the shared login.issueTokens path and (optionally) trusts the device.
const verifyTwoFactor = async (props) => {
  const { challengeId, code } = props
  const trust = props.trustDevice === true || props.trustDevice === "true"

  if (!challengeId || !code) return fieldNotFilledIn("Challenge or code")

  const challenge = await TwoFactorChallenge.findById(challengeId)
  if (!challenge) return notFound("Challenge")
  if (challenge.purpose && challenge.purpose !== "login") return notFound("Challenge")

  if (challenge.consumedAt) {
    return unauthorized("verify 2FA", "challenge already used")
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    return unauthorized("verify 2FA", "challenge expired")
  }
  if (challenge.attempts >= maxTwoFactorAttempts) {
    return unauthorized("verify 2FA", "too many attempts")
  }

  const user = await User.findById(challenge.user)
  if (!user) return notFound("user")

  const submitted = String(code).trim()
  let ok = false

  if (challenge.method === "email") {
    ok = Boolean(challenge.codeHash) && challenge.codeHash === hashCode(submitted)
  } else if (challenge.method === "totp") {
    ok = verifyTotp(user.twoFactor?.totpSecret, submitted)
  }

  // Backup recovery codes work for either method. Consumed single-use.
  let usedBackupHash = null
  if (!ok && Array.isArray(user.twoFactor?.backupCodes)) {
    const candidate = hashBackupCode(submitted)
    if (user.twoFactor.backupCodes.includes(candidate)) {
      ok = true
      usedBackupHash = candidate
    }
  }

  if (!ok) {
    await TwoFactorChallenge.updateOne(
      { _id: challenge._id },
      { $inc: { attempts: 1 } }
    )
    return invalidValue("verification code")
  }

  // Consume the challenge (and any used backup code) before issuing tokens.
  await TwoFactorChallenge.updateOne(
    { _id: challenge._id },
    { $set: { consumedAt: new Date() } }
  )
  if (usedBackupHash) {
    await User.updateOne(
      { _id: user._id },
      { $pull: { "twoFactor.backupCodes": usedBackupHash } }
    )
  }

  // Prefer the device metadata captured at challenge creation; fall back to the
  // verify request's metadata.
  const deviceId = challenge.deviceId || props.deviceId || null
  const ip = props.ip || challenge.ip || null
  const userAgent = props.userAgent || challenge.userAgent || null

  if (trust && deviceId) {
    await trustDevice({
      userId: user._id,
      deviceId,
      ip,
      userAgent,
      label: parseUserAgent(userAgent),
    })
  }

  // issueTokens also fires the new-device alert when the device is unseen.
  return login.issueTokens({ user, deviceId, ip, userAgent })
}

module.exports = verifyTwoFactor
