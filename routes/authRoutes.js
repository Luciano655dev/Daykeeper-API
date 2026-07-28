const express = require("express")
const router = express.Router()
const passport = require("passport")
const passportConfig = require("../api/config/passportAuth")

const {
  login,
  googleLogin,
  verifyTwoFactor,
  resendTwoFactor,
  startTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  register,
  refresh,
  logout,
  userData,
  confirmEmail,
  resendCode,
  forgetPassword,
  resetPassword,
  requestDeleteAccountCode,
} = require("../api/controllers/authController")

const userRegisterValidation = require("../middlewares/validations/auth/userRegisterValidation")
const userLoginValidation = require("../middlewares/validations/auth/userLoginValidation")
const checkTokenMW = require("../middlewares/checkTokenMW")
const rateLimit = require("../middlewares/rateLimit")

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  methods: ["POST"],
})

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  methods: ["POST"],
})

// Tighter limit on the second-factor endpoints (per-challenge brute force is
// also capped by TwoFactorChallenge.attempts).
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  methods: ["POST"],
})

const emailConfirmationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  methods: ["POST"],
  keyGenerator: (req) =>
    `${req.ip}:confirm-email:${String(req.body?.email || "").trim().toLowerCase()}`,
})

const resendVerificationLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 3,
  methods: ["POST"],
  keyGenerator: (req) =>
    `${req.ip}:resend-code:${String(req.body?.email || "").trim().toLowerCase()}`,
})

passportConfig(passport)

router.post("/register", userRegisterValidation, register)
router.post("/confirm_email", emailConfirmationLimiter, confirmEmail)
router.post("/forget_password", forgetPassword)
router.post("/reset_password", resetPassword)
router.post("/resend_code", resendVerificationLimiter, resendCode)
router.post("/request_delete_code", checkTokenMW, requestDeleteAccountCode)

router.get("/user", checkTokenMW, userData)

router.post(
  "/login",
  userLoginValidation,
  passport.authenticate("local"),
  login
)

router.post("/refresh", refreshLimiter, refresh)
router.post("/logout", logout)

// Second-factor verification for a login held by a twoFactorRequired response.
router.post("/2fa/verify", twoFactorLimiter, verifyTwoFactor)
router.post("/2fa/resend", twoFactorLimiter, resendTwoFactor)

// 2FA enrollment/management (authenticated).
router.post("/2fa/setup/start", checkTokenMW, startTwoFactorSetup)
router.post("/2fa/setup/confirm", checkTokenMW, confirmTwoFactorSetup)
router.post("/2fa/disable", checkTokenMW, disableTwoFactor)

// Unified Google sign-in: web (GIS) and mobile (expo-auth-session) both obtain a
// Google ID token client-side and POST it here for server-side verification.
router.post("/google", googleLimiter, googleLogin)

module.exports = router
