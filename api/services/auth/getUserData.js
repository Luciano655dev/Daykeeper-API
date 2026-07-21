const User = require("../../models/User")
const { serializeMediaPayload } = require("../../utils/serializeMediaPayload")

module.exports = async function getUserData({ userId }) {
  const user = await User.findById(userId).select(
    "_id username displayName email profile_picture roles verified_email timeZone private twoFactor"
  )

  if (!user || user.status === "deleted") {
    return { code: 404, message: "User not found", user: null }
  }

  const obj = user.toObject()
  // Expose only a safe 2FA summary — never the secret or backup-code hashes.
  obj.twoFactor = {
    enabled: obj.twoFactor?.enabled === true,
    method: obj.twoFactor?.method || "email",
  }

  return {
    code: 200,
    message: "User data",
    user: serializeMediaPayload(obj),
  }
}
