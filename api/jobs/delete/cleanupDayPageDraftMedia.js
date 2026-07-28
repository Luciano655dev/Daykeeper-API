const cron = require("node-cron")
const DayPage = require("../../models/DayPage")
const Media = require("../../models/Media")

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

async function cleanupDayPageDraftMedia() {
  const cutoff = new Date(Date.now() - DRAFT_TTL_MS)
  const now = new Date()

  try {
    const pages = await DayPage.find({
      blocks: {
        $elemMatch: {
          draftId: { $ne: null },
          created_at: { $lt: cutoff },
        },
      },
    })

    const mediaIds = []
    for (const page of pages) {
      const expired = page.blocks.filter(
        (block) =>
          block.draftId &&
          block.created_at &&
          new Date(block.created_at).getTime() < cutoff.getTime(),
      )
      mediaIds.push(...expired.map((block) => block.mediaId).filter(Boolean))
      page.blocks = page.blocks.filter((block) => !expired.includes(block))
      page.updated_at = now
      page.markModified("blocks")
      await page.save()
    }

    if (mediaIds.length) {
      await Media.updateMany(
        { _id: { $in: mediaIds } },
        {
          $set: {
            usedIn: null,
            status: "deleted",
            deletedAt: now,
          },
        },
      )
    }

    const staged = await Media.updateMany(
      {
        stagedFor: "DayPage",
        usedIn: null,
        created_at: { $lt: cutoff },
        status: { $in: ["public", "pending"] },
      },
      {
        $set: {
          status: "deleted",
          deletedAt: now,
        },
      },
    )

    const removed = mediaIds.length + Number(staged.modifiedCount || 0)
    if (removed) console.log(`cleanupDayPageDraftMedia: marked ${removed} media items deleted`)
  } catch (error) {
    console.error("cleanupDayPageDraftMedia failed:", error)
  }
}

cron.schedule("30 2 * * *", cleanupDayPageDraftMedia)

module.exports = cleanupDayPageDraftMedia
