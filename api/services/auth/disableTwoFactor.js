const User = require("../../models/User")
const bcrypt = require("bcryptjs")
const { verifyTotp } = require("../../utils/twoFactor")

const {
  errors: { unauthorized, invalidValue, notFound },
  success: { custom },
} = require("../../../constants/index")

// Disables 2FA after re-authenticating the request. Requires the account
// password (if the user has one) or, for TOTP users, a current authenticator
// code. This guards against an open/stolen session turning protection off.
const disableTwoFactor = async (props) => {
  const { loggedUser, password, code } = props

  if (!loggedUser?._id) return unauthorized("disable two-factor")

  const user = await User.findById(loggedUser._id)
  if (!user) return notFound("user")
  if (!user.twoFactor?.enabled) {
    return custom("Two-factor authentication is already disabled")
  }

  let reauthed = false

  if (password && user.password) {
    reauthed = await bcrypt.compare(password, user.password)
    if (!reauthed) return invalidValue("password")
  } else if (code && user.twoFactor.method === "totp") {
    reauthed = verifyTotp(user.twoFactor.totpSecret, code)
    if (!reauthed) return invalidValue("authenticator code")
  } else if (user.password) {
    // A password exists but wasn't supplied.
    return unauthorized("disable two-factor", "password required")
  } else {
    // Passwordless account (e.g. Google-only) using email 2FA: the valid access
    // token already proves identity.
    reauthed = true
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "twoFactor.enabled": false,
        "twoFactor.method": "email",
        "twoFactor.totpSecret": null,
        "twoFactor.enabledAt": null,
        "twoFactor.backupCodes": [],
      },
      $unset: { "twoFactor.pendingTotpSecret": 1 },
    }
  )

  return custom("Two-factor authentication disabled")
}

module.exports = disableTwoFactor
