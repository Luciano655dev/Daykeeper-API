/**
 * Backfill pre-entry DayPage blocks as one timestamped legacy entry per day.
 *
 * Dry run:
 *   node scripts/migrateDayPageEntries.js
 *
 * Apply:
 *   node scripts/migrateDayPageEntries.js --apply
 */

require("dotenv").config()

const mongoose = require("mongoose")
const DayPage = require("../api/models/DayPage")

const apply = process.argv.includes("--apply")

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!mongoUri) throw new Error("MONGODB_URI (or MONGO_URI) is required")

  await mongoose.connect(mongoUri)
  let scanned = 0
  let changed = 0

  const cursor = DayPage.find({ "blocks.0": { $exists: true } }).cursor()
  for await (const page of cursor) {
    scanned++
    const fallbackPublishedAt =
      page.created_at || page.updated_at || page.date || new Date()
    let pageChanged = false

    for (const block of page.blocks) {
      if (
        block.draftId ||
        (
          block.entryId &&
          block.publishedAt &&
          block.entryCreatedAt &&
          block.entryUpdatedAt &&
          block.entryVersion
        )
      ) {
        continue
      }
      block.entryId ||= page._id
      block.publishedAt ||= fallbackPublishedAt
      block.entryCreatedAt ||=
        page.created_at || block.created_at || fallbackPublishedAt
      block.entryUpdatedAt ||=
        page.updated_at || block.updated_at || block.entryCreatedAt
      block.entryVersion = Math.max(1, Number(block.entryVersion) || 1)
      pageChanged = true
    }

    if (!pageChanged) continue
    changed++
    if (apply) {
      page.markModified("blocks")
      await page.save()
    }
  }

  console.log(
    `migrateDayPageEntries: scanned=${scanned} changed=${changed} mode=${apply ? "apply" : "dry-run"}`,
  )
  await mongoose.disconnect()
}

run().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => null)
  process.exitCode = 1
})
