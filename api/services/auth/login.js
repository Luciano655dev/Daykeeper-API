const {
  success: { custom },
  auth: { twoFactorCodeExpiresTime },
} = require("../../../constants/index")
const { serializeMediaPayload } = require("../../utils/serializeMediaPayload")
const {
  signAccessToken,
  makeRefreshToken,
  storeRefreshToken,
} = require("../../utils/token")
const {
  isDeviceTrusted,
  isKnownDevice,
} = require("../../utils/deviceTrust")
const { make6DigitCode, hashCode } = require("../../utils/twoFactor")
const { sendNewDeviceAlert } = require("../../utils/loginAlert")
const { sendTwoFactorCodeEmail } = require("../../utils/emailHandler")
const TwoFactorChallenge = require("../../models/TwoFactorChallenge")

function sanitizeUser(user) {
  return serializeMediaPayload({
    id: user._id,
    username: user.username,
    email: user.email,
    profile_picture: user.profile_picture,
    roles: user.roles,
  })
}

// "luc****@gmail.com" — enough to recognize the inbox without leaking it.
function maskEmail(email) {
  if (!email || !email.includes("@")) return email || ""
  const [local, domain] = email.split("@")
  const visible = local.slice(0, Math.min(3, local.length))
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`
}

// Mints access + refresh tokens, stores the refresh token, and (best-effort)
// fires a new-device alert when this device hasn't been seen before. Shared by
// password login (this file) and the post-2FA verification path.
async function issueTokens({ user, deviceId, ip, userAgent }) {
  const isNew = !(await isKnownDevice(user._id, deviceId))

  const accessToken = signAccessToken(user)
  const refreshToken = makeRefreshToken()

  await storeRefreshToken({
    userId: user._id,
    refreshToken,
    deviceId,
    ip,
    userAgent,
  })

  if (isNew) {
    // Fire-and-forget: never block or fail login on an alert send.
    sendNewDeviceAlert({ user, ip, userAgent, when: new Date() }).catch(
      () => null
    )
  }

  return custom(`${user?.username} logged successfully`, {
    props: {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    },
  })
}

async function login(props) {
  const { user, deviceId, ip, userAgent } = props

  // Second factor required only when the user opted in AND this device isn't
  // already trusted. Google login bypasses this (the Google account is the
  // second factor) but still issues tokens via its own call to issueTokens.
  const twoFactorOn = user?.twoFactor?.enabled === true
  const trusted = twoFactorOn && (await isDeviceTrusted(user._id, deviceId))

  if (twoFactorOn && !trusted) {
    const method = user.twoFactor.method === "totp" ? "totp" : "email"

    const challenge = {
      user: user._id,
      method,
      expiresAt: new Date(Date.now() + twoFactorCodeExpiresTime),
      deviceId: deviceId || null,
      ip: ip || null,
      userAgent: userAgent || null,
    }

    if (method === "email") {
      const code = make6DigitCode()
      challenge.codeHash = hashCode(code)
      sendTwoFactorCodeEmail({
        username: user.username,
        email: user.email,
        code,
      }).catch(() => null)
    }

    const doc = await TwoFactorChallenge.create(challenge)

    return custom(`Two-factor authentication required`, {
      props: {
        twoFactorRequired: true,
        challengeId: doc._id,
        method,
        email: maskEmail(user.email),
      },
    })
  }

  return issueTokens({ user, deviceId, ip, userAgent })
}

login.issueTokens = issueTokens
module.exports = login
