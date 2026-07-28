const TrustedDevice = require("../../models/TrustedDevice")
const {
  errors: { unauthorized },
  success: { deleted },
} = require("../../../constants/index")

// Removes all trusted devices for the user — every device must pass 2FA again.
const revokeAllTrustedDevices = async (props) => {
  const { loggedUser } = props

  if (!loggedUser?._id) return unauthorized("revoke trusted devices")

  const result = await TrustedDevice.deleteMany({ user: loggedUser._id })

  return deleted("trusted devices", {
    deletedCount: result.deletedCount ?? 0,
  })
}

module.exports = revokeAllTrustedDevices
