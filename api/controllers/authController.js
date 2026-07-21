const {
  errors: { serverError },
} = require("../../constants/index")

const login = require("../services/auth/login")
const googleLogin = require("../services/auth/googleLogin")
const register = require("../services/auth/register")
const refresh = require("../services/auth/refresh")
const logout = require("../services/auth/logout")
const confirmEmail = require("../services/auth/confirmEmail")
const resendVerificationCode = require("../services/auth/resendVerificationCode")
const forgetPassword = require("../services/auth/forgetPassword")
const resetPassword = require("../services/auth/resetPassword")
const requestDeleteAccountCode = require("../services/auth/requestDeleteAccountCode")
const getUserData = require("../services/auth/getUserData")
const verifyTwoFactor = require("../services/auth/verifyTwoFactor")
const resendTwoFactorCode = require("../services/auth/resendTwoFactorCode")
const startTwoFactorSetup = require("../services/auth/startTwoFactorSetup")
const confirmTwoFactorSetup = require("../services/auth/confirmTwoFactorSetup")
const disableTwoFactor = require("../services/auth/disableTwoFactor")

// login
const loginController = async (req, res) => {
  try {
    const { code, message, props } = await login({
      user: req.user,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      deviceId: req.body?.deviceId || null,
    })

    return res.status(code).json({ message, ...props })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// google login (verifies a Google ID token, then issues Daykeeper JWTs)
const googleLoginController = async (req, res) => {
  try {
    const { code, message, props } = await googleLogin({
      idToken: req.body?.idToken,
      deviceId: req.body?.deviceId || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })

    return res.status(code).json({ message, ...(props || {}) })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// verify second factor (completes a login that returned twoFactorRequired)
const verifyTwoFactorController = async (req, res) => {
  try {
    const { code, message, props } = await verifyTwoFactor({
      challengeId: req.body?.challengeId,
      code: req.body?.code,
      trustDevice: req.body?.trustDevice,
      deviceId: req.body?.deviceId || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })

    return res.status(code).json({ message, ...(props || {}) })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// resend the email OTP for an active 2FA login challenge
const resendTwoFactorController = async (req, res) => {
  try {
    const { code, message } = await resendTwoFactorCode({
      challengeId: req.body?.challengeId,
    })

    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// start 2FA enrollment (authed)
const startTwoFactorSetupController = async (req, res) => {
  try {
    const { code, message, props } = await startTwoFactorSetup({
      loggedUser: req.user,
      method: req.body?.method,
    })

    return res.status(code).json({ message, ...(props || {}) })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// confirm 2FA enrollment (authed) -> returns backup codes
const confirmTwoFactorSetupController = async (req, res) => {
  try {
    const { code, message, props } = await confirmTwoFactorSetup({
      loggedUser: req.user,
      challengeId: req.body?.challengeId || null,
      code: req.body?.code,
    })

    return res.status(code).json({ message, ...(props || {}) })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// disable 2FA (authed, re-auth with password or current code)
const disableTwoFactorController = async (req, res) => {
  try {
    const { code, message } = await disableTwoFactor({
      loggedUser: req.user,
      password: req.body?.password,
      code: req.body?.code,
    })

    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// register
const registerController = async (req, res) => {
  try {
    const { code, message, user } = await register(req.body)

    return res.status(code).json({ message, user })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// refrest token
const refreshController = async (req, res) => {
  try {
    const { code, message, props } = await refresh({
      ...req.body,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })

    return res.status(code).json({ message, ...props })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// logout
const logoutController = async (req, res) => {
  try {
    const { code, message } = await logout(req.body)

    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// verifyEmail
const confirmEmailController = async (req, res) => {
  try {
    const { code, message, props } = await confirmEmail({
      ...req.body,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      deviceId: req.body?.deviceId || null,
    })

    return res.status(code).json({ message, ...(props || {}) })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// resend verification code
const resendCodeController = async (req, res) => {
  try {
    const { code, message } = await resendVerificationCode(
      { ...req.body },
      req.body?.type // "verify" (verifyEmail) || "reset" (resetPassword)
    )

    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// request delete account code
const requestDeleteAccountCodeController = async (req, res) => {
  try {
    const { code, message } = await requestDeleteAccountCode({
      loggedUser: req.user,
    })

    return res.status(code).json({ message })
  } catch (error) {
    return res.status(500).json({ message: `${error}` })
  }
}

// forgetPassword
const forgetPasswordController = async (req, res) => {
  try {
    const { code, message } = await forgetPassword(req.body)

    return res.status(code).json({ message })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: serverError(error.message) })
  }
}

// resetPassword
const resetPasswordController = async (req, res) => {
  try {
    const { code, message } = await resetPassword({ ...req.query, ...req.body })

    return res
      .status(code)
      .json({ message: message || "Password reset successfull" })
  } catch (error) {
    console.error(error)
    return res.status(400).json({
      message:
        "Invalid or expired token. If this error persists, contact an admin",
    })
  }
}

// userData
const userDataController = async (req, res) => {
  try {
    const { code, message, user } = await getUserData({
      userId: req.auth.userId,
    })

    return res.status(code).json({ message, user })
  } catch (error) {
    return res.status(500).json({ message: serverError(error.message) })
  }
}

module.exports = {
  login: loginController,
  googleLogin: googleLoginController,
  verifyTwoFactor: verifyTwoFactorController,
  resendTwoFactor: resendTwoFactorController,
  startTwoFactorSetup: startTwoFactorSetupController,
  confirmTwoFactorSetup: confirmTwoFactorSetupController,
  disableTwoFactor: disableTwoFactorController,
  register: registerController,
  refresh: refreshController,
  logout: logoutController,
  userData: userDataController,
  confirmEmail: confirmEmailController,
  resendCode: resendCodeController,
  requestDeleteAccountCode: requestDeleteAccountCodeController,
  forgetPassword: forgetPasswordController,
  resetPassword: resetPasswordController,
}
