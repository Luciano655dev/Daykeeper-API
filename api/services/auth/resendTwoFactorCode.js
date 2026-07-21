const User = require("../../models/User")
const TwoFactorChallenge = require("../../models/TwoFactorChallenge")
const { make6DigitCode, hashCode } = require("../../utils/twoFactor")
const { sendTwoFactorCodeEmail } = require("../../utils/emailHandler")

const {
  errors: { notFound, unauthorized, fieldNotFilledIn },
  success: { custom },
  auth: { twoFactorCodeExpiresTime },
} = require("../../../constants/index")

// Re-issues the email OTP for an active login challenge (email method only).
const resendTwoFactorCode = async (props) => {
  const { challengeId } = props
  if (!challengeId) return fieldNotFilledIn("Challenge")

  const challenge = await TwoFactorChallenge.findById(challengeId)
  if (!challenge) return notFound("Challenge")

  if (challenge.method !== "email") {
    return unauthorized("resend code", "challenge does not use email codes")
  }
  if (challenge.consumedAt) {
    return unauthorized("resend code", "challenge already used")
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    return unauthorized("resend code", "challenge expired")
  }

  const user = await User.findById(challenge.user)
  if (!user) return notFound("user")

  const code = make6DigitCode()
  await TwoFactorChallenge.updateOne(
    { _id: challenge._id },
    {
      $set: {
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + twoFactorCodeExpiresTime),
        attempts: 0,
      },
    }
  )

  sendTwoFactorCodeEmail({
    username: user.username,
    email: user.email,
    code,
  }).catch(() => null)

  return custom("Verification code resent")
}

module.exports = resendTwoFactorCode
