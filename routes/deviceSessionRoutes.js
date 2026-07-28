const express = require("express")
const router = express.Router()

const checkTokenMW = require("../middlewares/checkTokenMW")
const {
  getDeviceSessions,
  revokeDeviceSession,
  revokeAllDeviceSessions,
  getTrustedDevices,
  revokeTrustedDevice,
  revokeAllTrustedDevices,
} = require("../api/controllers/deviceSessionController")

router.get("/", checkTokenMW, getDeviceSessions)
router.delete("/", checkTokenMW, revokeAllDeviceSessions)

// Trusted devices (devices allowed to skip 2FA). Declared before "/:id" so
// "/trusted" isn't swallowed by the session id param route.
router.get("/trusted", checkTokenMW, getTrustedDevices)
router.delete("/trusted", checkTokenMW, revokeAllTrustedDevices)
router.delete("/trusted/:id", checkTokenMW, revokeTrustedDevice)

router.delete("/:id", checkTokenMW, revokeDeviceSession)

module.exports = router
