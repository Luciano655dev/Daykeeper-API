const mongoose = require("mongoose")

const mediaSchema = mongoose.Schema({
  title: String,
  key: String,
  type: String, // 'image' / 'video'
  url: String,

  verified: Boolean,

  jobId: String,
  usedIn: {
    model: String,
    refId: String,
  },
  uploadedBy: String,
  created_at: Date,
  stagedFor: { type: String, default: null },
  stagedDateKey: { type: String, default: null },

  status: {
    type: String,
    enum: ["pending", "public", "rejected", "deleted"],
    default: "pending",
    index: true,
  },
  deletedAt: { type: Date, default: null, required: false },
})

const Media = mongoose.model("Media", mediaSchema, "media")

module.exports = Media
