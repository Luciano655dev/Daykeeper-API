const User = require("../../models/User")
const crypto = require("crypto")

const {
  errors: {
    notFound,
    unauthorized,
    fieldNotFilledIn,
    invalidValue,
  },
  success: { custom },
} = require("../../../constants/index")

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex")
}

const confirmEmail = async (props) => {
  let { email, verificationCode } = props

  if (!verificationCode || !email) return fieldNotFilledIn("Token or Email")

  // normalize
  email = email.trim().toLowerCase()
  verificationCode = verificationCode.toString().trim()

  // hash incoming code to compare with stored hash
  const codeHash = hashCode(verificationCode)

  // Find user (normalized email)
  const user = await User.findOne({ email })
  if (!user) return notFound("user")

  // If already verified, you can just return success (optional)
  if (user.status === "deleted" || user.deletedAt) {
    return notFound("user")
  }

  if (user.banned) {
    return unauthorized("confirm email", "This account is unavailable")
  }

  if (user.verified_email) {
    return custom(`${user.username}'s email is already confirmed`)
  }

  // If no code stored (never requested / already cleared)
  if (!user.verification_code_hash || !user.verification_expires_at) {
    return invalidValue("Verification code")
  }

  // Expired
  if (user.verification_expires_at.getTime() < Date.now()) {
    // clear expired code
    await User.updateOne(
      { _id: user._id },
      {
        $unset: {
          verification_code_hash: 1,
          verification_expires_at: 1,
        },
      }
    )

    return unauthorized("confirm email", "time expired")
  }

  // Wrong code
  if (user.verification_code_hash !== codeHash) {
    // Keep the current code valid until its expiry. A typo should not force the
    // user to request a new email; request-level rate limits handle brute force.
    return invalidValue("Verification code")
  }

  // Correct code -> verify atomically
  await User.updateOne(
    { _id: user._id },
    {
      $set: { verified_email: true },
      $unset: {
        verification_code_hash: 1,
        verification_expires_at: 1,
      },
    }
  )

  const freshUser = await User.findById(user._id)
  if (!freshUser) return notFound("user")

  return custom(`${freshUser.username}'s email confirmed successfully`)
}

module.exports = confirmEmail
