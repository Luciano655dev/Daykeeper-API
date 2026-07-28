require("dotenv").config()
const mongoose = require("mongoose")

const userSchema = mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: false,
    trim: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  profile_picture: {
    title: String,
    key: String,
    url: String,
  },
  password: { type: String, default: null },
  timeZone: String,
  bio: String,
  verified_email: Boolean,
  private: Boolean,
  roles: [String], // ['user', 'admin']
  google_id: { type: String },

  // Post strikes, like Duolingo
  currentStreak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 },
  streakLastDay: { type: String, default: 0, required: false },

  device_tokens: [
    {
      type: String,
      required: false,
    },
  ],

  created_at: {
    type: Date,
    default: Date.now,
    required: true,
    index: true,
  },

  verification_code_hash: {
    type: String,
    required: false,
  },
  verification_expires_at: {
    type: Date,
    required: false,
  },
  reset_code_hash: {
    type: String,
    required: false,
  },
  reset_expires_at: {
    type: Date,
    required: false,
  },
  delete_code_hash: {
    type: String,
    required: false,
  },
  delete_expires_at: {
    type: Date,
    required: false,
  },

  // Two-factor authentication (opt-in). `method` decides how the login
  // challenge is satisfied: "email" (6-digit OTP) or "totp" (authenticator app).
  // totpSecret/backupCodes are only populated once the user confirms enrollment.
  twoFactor: {
    enabled: { type: Boolean, default: false },
    method: { type: String, enum: ["email", "totp"], default: "email" },
    totpSecret: { type: String, default: null }, // base32; null until TOTP confirmed
    pendingTotpSecret: { type: String, default: null }, // staged during setup, before confirm
    enabledAt: { type: Date, default: null },
    backupCodes: [{ type: String }], // sha256 hashes, single-use
  },

  banned: { type: Boolean, default: false, required: false },

  status: {
    type: String,
    enum: ["pending", "public", "rejected", "deleted"],
    default: "public",
    index: true,
  },
  deletedAt: { type: Date, default: null, required: false },
})

// Indexes
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $exists: true, $ne: null, $ne: "" },
    },
  },
)
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $ne: null, $ne: "" },
    },
  },
)
userSchema.index(
  { google_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      google_id: { $exists: true, $ne: null },
    },
  },
)

const User = mongoose.model("User", userSchema)

module.exports = User
