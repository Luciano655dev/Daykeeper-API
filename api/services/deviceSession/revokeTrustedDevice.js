const TrustedDevice = require("../../models/TrustedDevice")
const {
  errors: { unauthorized, fieldNotFilledIn, notFound },
  success: { deleted },
} = require("../../../constants/index")

// Revokes (deletes) one trusted device. The next login from it will re-challenge
// for 2FA.
const revokeTrustedDevice = async (props) => {
  const { loggedUser, trustedDeviceId } = props

  if (!loggedUser?._id) return unauthorized("revoke trusted device")
  if (!trustedDeviceId) return fieldNotFilledIn("trustedDeviceId")

  const row = await TrustedDevice.findOneAndDelete({
    _id: trustedDeviceId,
    user: loggedUser._id,
  }).select("_id")

  if (!row) return notFound("Trusted device")

  return deleted("trusted device", { id: row._id })
}

module.exports = revokeTrustedDevice
