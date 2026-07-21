const { buildEmail } = require("./base")

const twoFactorCodeTemplate = ({ username, code }) => {
  const { html, text } = buildEmail({
    preheader: "Your Daykeeper sign-in code.",
    title: "Your sign-in code",
    greeting: username ? `Hi ${username},` : "Hi there,",
    intro:
      "Use the code below to finish signing in to your Daykeeper account. It expires in 10 minutes.",
    code,
    outro:
      "If you did not try to sign in, someone may have your password. Change it right away and review your devices.",
  })

  return {
    subject: "Your Daykeeper sign-in code",
    html,
    text,
  }
}

module.exports = twoFactorCodeTemplate
