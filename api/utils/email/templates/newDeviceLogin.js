const { buildEmail } = require("./base")

const newDeviceLoginTemplate = ({ username, device, ip, when, secureUrl }) => {
  const { html, text } = buildEmail({
    preheader: "A new device just signed in to your Daykeeper account.",
    title: "New sign-in to your account",
    greeting: username ? `Hi ${username},` : "Hi there,",
    intro:
      "We noticed a sign-in to your Daykeeper account from a device we haven't seen before.",
    sections: [
      { title: "Device", body: device || "Unknown device" },
      { title: "IP address", body: ip || "Unknown" },
      { title: "When", body: when || "Just now" },
    ],
    cta: secureUrl ? { label: "Secure my account", url: secureUrl } : undefined,
    outro:
      "If this was you, no action is needed.\n\n" +
      "If this wasn't you, act now:\n" +
      "1. Change your password immediately.\n" +
      "2. Review your devices and sign out the ones you don't recognize.\n" +
      "3. Turn on two-factor authentication if you haven't already.\n" +
      "If you need help, just reply to this email.",
    footerNote:
      "You're receiving this security alert because someone signed in to your Daykeeper account.",
  })

  return {
    subject: "New sign-in to your Daykeeper account",
    html,
    text,
  }
}

module.exports = newDeviceLoginTemplate
