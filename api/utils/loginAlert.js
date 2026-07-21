const { sendNewDeviceLoginEmail } = require("./emailHandler")
const { createNotification } = require("../services/notification/createNotification")
const { parseUserAgent } = require("./deviceTrust")

const WEBAPP_URL = process.env.WEBAPP_URL || "https://daykeeper.app"

// Format a timestamp in the user's timezone (best-effort; falls back to UTC).
function formatWhen(when, timeZone) {
  const date = when instanceof Date ? when : new Date(when || Date.now())
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "UTC",
    }).format(date)
  } catch {
    return date.toUTCString()
  }
}

// Fire-and-forget security alert when an account is accessed from a new device.
// Sends BOTH an email and a push notification + in-app notification row. Never
// throws — matches the existing best-effort email convention so it can't block
// or fail a login.
async function sendNewDeviceAlert({ user, ip, userAgent, when }) {
  if (!user?.email) return

  const device = parseUserAgent(userAgent)
  const whenText = formatWhen(when, user.timeZone)
  const secureUrl = `${WEBAPP_URL}/forgot-password`

  await Promise.allSettled([
    sendNewDeviceLoginEmail({
      username: user.username,
      email: user.email,
      device,
      ip: ip || "Unknown",
      when: whenText,
      secureUrl,
    }),
    createNotification({
      userId: user._id,
      type: "security_login",
      title: "New sign-in to your account",
      body: `${device} · ${ip || "Unknown IP"}`,
      data: { ip: ip || "", device, when: whenText },
      sendPush: true,
    }),
  ])
}

module.exports = { sendNewDeviceAlert, formatWhen }
