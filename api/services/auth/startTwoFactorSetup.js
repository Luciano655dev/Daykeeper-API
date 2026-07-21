const User = require("../../models/User")
const TwoFactorChallenge = require("../../models/TwoFactorChallenge")
const {
  make6DigitCode,
  hashCode,
  generateTotpSecret,
  buildTotpUri,
  buildTotpQrDataUrl,
} = require("../../utils/twoFactor")
const { sendTwoFactorCodeEmail } = require("../../utils/emailHandler")

const {
  errors: { unauthorized, invalidValue, custom: customError },
  success: { custom },
  auth: { twoFactorCodeExpiresTime },
} = require("../../../constants/index")

// Begins 2FA enrollment for the logged-in user.
//  - method "totp": returns a secret + otpauth URI + QR data URL to scan. The
//    secret is staged as pendingTotpSecret and only promoted on confirm.
//  - method "email": emails a confirmation code (stored as a "setup" challenge).
// Nothing is enabled until confirmTwoFactorSetup succeeds.
const startTwoFactorSetup = async (props) => {
  const { loggedUser } = props
  const method = props.method === "totp" ? "totp" : "email"

  if (!loggedUser?._id) return unauthorized("set up two-factor")
  if (loggedUser.twoFactor?.enabled) {
    return customError("Two-factor authentication is already enabled", {}, 409)
  }

  if (method === "totp") {
    const secret = generateTotpSecret()
    const account = loggedUser.email || loggedUser.username || "Daykeeper user"
    const otpauthUri = buildTotpUri(secret, account)
    const qrDataUrl = await buildTotpQrDataUrl(otpauthUri)

    await User.updateOne(
      { _id: loggedUser._id },
      { $set: { "twoFactor.pendingTotpSecret": secret } }
    )

    return custom("Scan the QR code with your authenticator app", {
      props: { method: "totp", secret, otpauthUri, qrDataUrl },
    })
  }

  // email method
  if (!loggedUser.email) return invalidValue("email")

  const code = make6DigitCode()
  const challenge = await TwoFactorChallenge.create({
    user: loggedUser._id,
    method: "email",
    purpose: "setup",
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + twoFactorCodeExpiresTime),
  })

  sendTwoFactorCodeEmail({
    username: loggedUser.username,
    email: loggedUser.email,
    code,
  }).catch(() => null)

  return custom("Confirmation code sent to your email", {
    props: { method: "email", challengeId: challenge._id },
  })
}

module.exports = startTwoFactorSetup
