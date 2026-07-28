const User = require("../../models/User")
const TwoFactorChallenge = require("../../models/TwoFactorChallenge")
const {
  hashCode,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
} = require("../../utils/twoFactor")

const {
  errors: { unauthorized, invalidValue, notFound, fieldNotFilledIn },
  success: { custom },
} = require("../../../constants/index")

// Confirms enrollment started by startTwoFactorSetup and flips twoFactor.enabled.
// Returns one-time backup codes (shown to the user once). Determines the method
// from the input: a challengeId means email; otherwise TOTP (pendingTotpSecret).
const confirmTwoFactorSetup = async (props) => {
  const { loggedUser, challengeId, code } = props

  if (!loggedUser?._id) return unauthorized("confirm two-factor")
  if (!code) return fieldNotFilledIn("Code")

  const user = await User.findById(loggedUser._id)
  if (!user) return notFound("user")
  if (user.twoFactor?.enabled) {
    return unauthorized("confirm two-factor", "already enabled")
  }

  let method
  if (challengeId) {
    // ----- email enrollment -----
    method = "email"
    const challenge = await TwoFactorChallenge.findById(challengeId)
    if (
      !challenge ||
      challenge.purpose !== "setup" ||
      String(challenge.user) !== String(user._id)
    ) {
      return notFound("Challenge")
    }
    if (challenge.consumedAt) {
      return unauthorized("confirm two-factor", "code already used")
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return unauthorized("confirm two-factor", "code expired")
    }
    if (challenge.codeHash !== hashCode(String(code).trim())) {
      return invalidValue("confirmation code")
    }
    await TwoFactorChallenge.updateOne(
      { _id: challenge._id },
      { $set: { consumedAt: new Date() } }
    )
  } else {
    // ----- TOTP enrollment -----
    method = "totp"
    const secret = user.twoFactor?.pendingTotpSecret
    if (!secret) return unauthorized("confirm two-factor", "no setup in progress")
    if (!verifyTotp(secret, code)) return invalidValue("authenticator code")
  }

  // Generate backup codes; persist only their hashes.
  const backupCodes = generateBackupCodes()
  const backupHashes = backupCodes.map(hashBackupCode)

  const set = {
    "twoFactor.enabled": true,
    "twoFactor.method": method,
    "twoFactor.enabledAt": new Date(),
    "twoFactor.backupCodes": backupHashes,
  }
  const unset = {}
  if (method === "totp") {
    set["twoFactor.totpSecret"] = user.twoFactor.pendingTotpSecret
    unset["twoFactor.pendingTotpSecret"] = 1
  }

  await User.updateOne(
    { _id: user._id },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
  )

  return custom("Two-factor authentication enabled", {
    props: { method, backupCodes },
  })
}

module.exports = confirmTwoFactorSetup
