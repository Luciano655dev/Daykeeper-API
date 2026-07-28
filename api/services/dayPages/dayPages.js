const mongoose = require("mongoose")
const sanitizeHtml = require("sanitize-html")
const { formatInTimeZone, fromZonedTime } = require("date-fns-tz")
const User = require("../../models/User")
const DayPage = require("../../models/DayPage")
const Media = require("../../models/Media")
const { getDayRangeDDMMYYYY } = require("../../utils/dayRange")
const { serializeMediaPayload } = require("../../utils/serializeMediaPayload")
const updateStreak = require("../user/streak/updateStreak")
const {
  success: { fetched, created, updated, deleted },
  errors: { notFound, invalidValue, custom: customError },
  dayPage: {
    maxBlocksPerPage,
    maxTextBlockLength,
    maxTaskTitleLength,
    maxEventTitleLength,
    maxEventDescriptionLength,
  },
  user: { defaultTimeZone },
} = require("../../../constants/index")
const { getDayPagePipeline } = require("../../repositories/index")

const ALLOWED_PRIVACIES = new Set(["public", "private", "close friends"])
const BLOCK_TYPES = new Set(["text", "task", "event", "image"])
const ALLOWED_BLOCK_UPDATES = new Set(["completed", "title", "content", "order"])
const MAX_MEDIA_BLOCKS = 5

const ALLOWED_HTML_OPTIONS = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del", "strike",
    "code", "pre", "h1", "h2", "h3", "ul", "ol", "li", "blockquote",
  ],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
}

function resolveDateKey(dateStr, tz) {
  const range = getDayRangeDDMMYYYY(dateStr, tz)
  if (!range) return null
  return {
    dateKey: formatInTimeZone(range.start, tz, "yyyy-MM-dd"),
    date: range.start,
  }
}

function publishedTimeForSelectedDay(resolved, tz, now = new Date()) {
  const localTime = formatInTimeZone(now, tz, "HH:mm:ss.SSS")
  return fromZonedTime(`${resolved.dateKey}T${localTime}`, tz)
}

function asPlainBlock(block) {
  return typeof block?.toObject === "function" ? block.toObject() : { ...block }
}

function objectIdString(value) {
  return value == null ? "" : String(value)
}

function isPublishedBlock(block) {
  return !!block && !block.draftId
}

function entryIdForBlock(block, page) {
  return objectIdString(block.entryId || page._id)
}

function legacyEntryMeta(page, block = {}) {
  const publishedAt =
    block.publishedAt || page.created_at || block.created_at || page.date || new Date()
  const createdAt = block.entryCreatedAt || page.created_at || block.created_at || publishedAt
  const updatedAt =
    block.entryUpdatedAt || block.updated_at || page.updated_at || createdAt
  return {
    entryId: block.entryId || page._id,
    publishedAt,
    entryCreatedAt: createdAt,
    entryUpdatedAt: updatedAt,
    entryVersion: Math.max(1, Number(block.entryVersion) || 1),
  }
}

function sanitizeBlock(raw, idx) {
  if (!raw || typeof raw !== "object" || !BLOCK_TYPES.has(raw.type)) return null

  const block = {
    type: raw.type,
    order: typeof raw.order === "number" ? raw.order : idx,
  }

  if (raw._id && mongoose.Types.ObjectId.isValid(raw._id)) {
    block._id = new mongoose.Types.ObjectId(String(raw._id))
  }

  if (raw.type === "text") {
    if (typeof raw.content !== "string") return null
    const sanitized = sanitizeHtml(raw.content, ALLOWED_HTML_OPTIONS)
    if (!sanitized.replace(/<[^>]*>/g, "").trim()) return null
    block.content = sanitized.slice(0, maxTextBlockLength)
  }

  if (raw.type === "task") {
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    block.title = raw.title.trim().slice(0, maxTaskTitleLength)
    block.completed = raw.completed === true
  }

  if (raw.type === "event") {
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    block.title = raw.title.trim().slice(0, maxEventTitleLength)
    block.description = typeof raw.description === "string"
      ? raw.description.trim().slice(0, maxEventDescriptionLength)
      : ""
    if (raw.dateStart) {
      const start = new Date(raw.dateStart)
      if (!Number.isNaN(start.getTime())) block.dateStart = start
    }
    if (raw.dateEnd) {
      const end = new Date(raw.dateEnd)
      if (!Number.isNaN(end.getTime())) block.dateEnd = end
    }
  }

  if (raw.type === "image") {
    if (!raw.mediaId || !mongoose.Types.ObjectId.isValid(raw.mediaId)) return null
    block.mediaId = new mongoose.Types.ObjectId(String(raw.mediaId))
  }

  return block
}

function sanitizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .slice(0, maxBlocksPerPage)
    .map(sanitizeBlock)
    .filter(Boolean)
}

function comparableBlock(block) {
  return JSON.stringify({
    type: block.type,
    content: block.content || "",
    title: block.title || "",
    completed: block.completed === true,
    description: block.description || "",
    dateStart: block.dateStart ? new Date(block.dateStart).toISOString() : "",
    dateEnd: block.dateEnd ? new Date(block.dateEnd).toISOString() : "",
    mediaId: objectIdString(block.mediaId),
  })
}

function decorateEntryBlock(block, meta, order, now) {
  return {
    ...block,
    order,
    entryId: new mongoose.Types.ObjectId(String(meta.entryId)),
    publishedAt: meta.publishedAt,
    entryCreatedAt: meta.entryCreatedAt,
    entryUpdatedAt: meta.entryUpdatedAt,
    entryVersion: meta.entryVersion,
    draftId: null,
    created_at: block.created_at || now,
    updated_at: now,
  }
}

async function populateBlocksMedia(pageObj) {
  const blocks = pageObj.blocks ?? []
  const imageBlocks = blocks.filter((block) => block.type === "image" && block.mediaId)
  if (imageBlocks.length === 0) return pageObj

  const mediaIds = imageBlocks.map((block) => block.mediaId)
  const mediaList = await Media.find(
    { _id: { $in: mediaIds } },
    {
      _id: 1,
      key: 1,
      type: 1,
      status: 1,
      title: 1,
      uploadedBy: 1,
    },
  ).lean()
  const mediaMap = new Map(mediaList.map((media) => [String(media._id), media]))

  return {
    ...pageObj,
    blocks: blocks.map((rawBlock) => {
      const block = asPlainBlock(rawBlock)
      if (block.type !== "image" || !block.mediaId) return block
      const media = mediaMap.get(String(block.mediaId))
      return media ? { ...block, media } : block
    }),
  }
}

async function serializePage(page, { includeDrafts = true } = {}) {
  if (!page) return null
  const plain = typeof page.toObject === "function" ? page.toObject() : { ...page }
  const visible = includeDrafts
    ? plain
    : { ...plain, blocks: (plain.blocks || []).filter(isPublishedBlock) }
  const populated = await populateBlocksMedia(visible)
  return serializeMediaPayload(populated)
}

async function validateNewMedia(mediaIds, loggedUser, pageId = null) {
  const uniqueIds = [...new Set(mediaIds.map(String))]
  if (uniqueIds.length === 0) return { ok: true, docs: [] }

  const docs = await Media.find({ _id: { $in: uniqueIds } })
  if (docs.length !== uniqueIds.length) return { ok: false, docs: [] }

  const userId = String(loggedUser._id)
  const valid = docs.every((doc) => {
    const sameOwner = String(doc.uploadedBy || "") === userId
    const usableStatus = !["deleted", "rejected"].includes(doc.status)
    const usedInPage =
      !doc.usedIn?.refId || (pageId && String(doc.usedIn.refId) === String(pageId))
    return sameOwner && usableStatus && usedInPage
  })
  return { ok: valid, docs }
}

async function claimMedia(mediaIds, page, dateKey) {
  if (!mediaIds.length) return
  await Media.updateMany(
    { _id: { $in: mediaIds } },
    {
      $set: {
        usedIn: { model: "DayPage", refId: String(page._id) },
        stagedFor: null,
        stagedDateKey: dateKey,
      },
    },
  )
}

async function releaseMedia(mediaIds, pageId) {
  if (!mediaIds.length) return
  const now = new Date()
  await Media.updateMany(
    {
      _id: { $in: mediaIds },
      "usedIn.model": "DayPage",
      "usedIn.refId": String(pageId),
    },
    {
      $set: {
        usedIn: null,
        status: "deleted",
        deletedAt: now,
      },
    },
  )
}

function imageIds(blocks) {
  return blocks
    .filter((block) => block.type === "image" && block.mediaId)
    .map((block) => new mongoose.Types.ObjectId(String(block.mediaId)))
}

async function getOrInitDayPage({ dateStr, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })

  if (!page) {
    return fetched("DayPage", {
      data: serializeMediaPayload({
        user: loggedUser._id,
        dateKey: resolved.dateKey,
        date: resolved.date,
        privacy: "public",
        blocks: [],
        entries: [],
        status: "public",
      }),
    })
  }

  return fetched("DayPage", { data: await serializePage(page) })
}

async function createEntry({ dateStr, blocks, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const sanitized = sanitizeBlocks(blocks)
  if (!sanitized.length) {
    return customError("Write something before publishing.", {}, 400)
  }

  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  const existingPublished = (existing?.blocks || []).filter(isPublishedBlock)
  if (existingPublished.length + sanitized.length > maxBlocksPerPage) {
    return customError(`A day can contain up to ${maxBlocksPerPage} blocks.`, {}, 413)
  }

  const mediaCount = existingPublished.filter((block) => block.type === "image").length
  const newMediaIds = imageIds(sanitized)
  if (mediaCount + newMediaIds.length > MAX_MEDIA_BLOCKS) {
    return customError(`A day can contain up to ${MAX_MEDIA_BLOCKS} media items.`, {}, 413)
  }

  const mediaCheck = await validateNewMedia(newMediaIds, loggedUser, existing?._id)
  if (!mediaCheck.ok) return customError("One or more media items are unavailable.", {}, 400)

  const now = new Date()
  const entryId = new mongoose.Types.ObjectId()
  const meta = {
    entryId,
    publishedAt: publishedTimeForSelectedDay(resolved, tz, now),
    entryCreatedAt: now,
    entryUpdatedAt: now,
    entryVersion: 1,
  }
  const newBlocks = sanitized.map((block, order) =>
    decorateEntryBlock(block, meta, order, now),
  )
  const hadPublishedContent = existingPublished.length > 0

  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $push: { blocks: { $each: newBlocks } },
      $set: {
        date: resolved.date,
        status: "public",
        deletedAt: null,
        updated_at: now,
      },
      $setOnInsert: {
        privacy: "public",
        created_at: now,
      },
    },
    { upsert: true, new: true },
  )

  await claimMedia(newMediaIds, page, resolved.dateKey)
  if (!hadPublishedContent) {
    await updateStreak(loggedUser._id, tz).catch(() => null)
  }

  return created("Day entry", { data: await serializePage(page) })
}

async function updateEntry({
  dateStr,
  entryId,
  blocks,
  version,
  force = false,
  loggedUser,
}) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!mongoose.Types.ObjectId.isValid(entryId)) return invalidValue("entryId")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  if (!page) return notFound("DayPage")

  const targetId = String(entryId)
  const targetBlocks = page.blocks.filter(
    (block) => isPublishedBlock(block) && entryIdForBlock(block, page) === targetId,
  )
  if (!targetBlocks.length) return notFound("Day entry")

  const currentVersion = Math.max(
    1,
    ...targetBlocks.map((block) => Number(block.entryVersion) || 1),
  )
  if (!force && Number(version) !== currentVersion) {
    return customError(
      "This entry changed on another device.",
      { data: await serializePage(page), conflict: true },
      409,
    )
  }

  const sanitized = sanitizeBlocks(blocks)
  if (!sanitized.length) {
    return customError("An entry cannot be empty. Delete it instead.", {}, 400)
  }

  const otherBlocks = page.blocks.filter(
    (block) => entryIdForBlock(block, page) !== targetId,
  )
  if (otherBlocks.filter(isPublishedBlock).length + sanitized.length > maxBlocksPerPage) {
    return customError(`A day can contain up to ${maxBlocksPerPage} blocks.`, {}, 413)
  }

  const otherMediaCount = otherBlocks.filter(
    (block) => isPublishedBlock(block) && block.type === "image",
  ).length
  const nextMediaIds = imageIds(sanitized)
  if (otherMediaCount + nextMediaIds.length > MAX_MEDIA_BLOCKS) {
    return customError(`A day can contain up to ${MAX_MEDIA_BLOCKS} media items.`, {}, 413)
  }

  const existingMediaSet = new Set(imageIds(targetBlocks).map(String))
  const genuinelyNewMedia = nextMediaIds.filter((id) => !existingMediaSet.has(String(id)))
  const mediaCheck = await validateNewMedia(genuinelyNewMedia, loggedUser, page._id)
  if (!mediaCheck.ok) return customError("One or more media items are unavailable.", {}, 400)

  const now = new Date()
  const first = targetBlocks[0]
  const priorMeta = legacyEntryMeta(page, first)
  const meta = {
    ...priorMeta,
    entryId: new mongoose.Types.ObjectId(targetId),
    entryUpdatedAt: now,
    entryVersion: currentVersion + 1,
  }
  const replacement = sanitized.map((block, order) => {
    const matching = targetBlocks.find(
      (existingBlock) => String(existingBlock._id) === String(block._id || ""),
    )
    return decorateEntryBlock(
      { ...block, created_at: matching?.created_at || now },
      meta,
      order,
      now,
    )
  })

  const retainedMedia = new Set(nextMediaIds.map(String))
  const removedMedia = imageIds(targetBlocks).filter((id) => !retainedMedia.has(String(id)))
  page.blocks = [...otherBlocks.map(asPlainBlock), ...replacement]
  page.updated_at = now
  page.markModified("blocks")
  await page.save()

  await releaseMedia(removedMedia, page._id)
  await claimMedia(genuinelyNewMedia, page, resolved.dateKey)
  return updated("Day entry", { data: await serializePage(page) })
}

async function deleteEntry({ dateStr, entryId, version, force = false, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!mongoose.Types.ObjectId.isValid(entryId)) return invalidValue("entryId")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  if (!page) return notFound("DayPage")

  const targetId = String(entryId)
  const targetBlocks = page.blocks.filter(
    (block) => isPublishedBlock(block) && entryIdForBlock(block, page) === targetId,
  )
  if (!targetBlocks.length) return notFound("Day entry")

  const currentVersion = Math.max(
    1,
    ...targetBlocks.map((block) => Number(block.entryVersion) || 1),
  )
  if (!force && Number(version) !== currentVersion) {
    return customError(
      "This entry changed on another device.",
      { data: await serializePage(page), conflict: true },
      409,
    )
  }

  page.blocks = page.blocks
    .filter((block) => entryIdForBlock(block, page) !== targetId)
    .map(asPlainBlock)
  page.updated_at = new Date()
  page.markModified("blocks")
  await page.save()
  await releaseMedia(imageIds(targetBlocks), page._id)

  return deleted("Day entry", { data: await serializePage(page) })
}

async function updatePrivacy({ dateStr, privacy, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!ALLOWED_PRIVACIES.has(privacy)) return invalidValue("privacy")

  const now = new Date()
  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $set: {
        privacy,
        date: resolved.date,
        status: "public",
        deletedAt: null,
        updated_at: now,
      },
      $setOnInsert: { created_at: now, blocks: [] },
    },
    { upsert: true, new: true },
  )
  return updated("Day page privacy", { data: await serializePage(page) })
}

// Legacy full-page saves are reconciled by child _id. Existing blocks keep
// their entry, while all genuinely new blocks become one new timestamped entry.
async function upsertDayPage({ dateStr, privacy, blocks, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const incoming = sanitizeBlocks(blocks)
  const now = new Date()
  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  const existingBlocks = (existing?.blocks || []).map(asPlainBlock)
  const existingById = new Map(existingBlocks.map((block) => [String(block._id), block]))
  const records = []
  const matchedIds = new Set()
  const changedGroups = new Set()
  const submittedGroupCounts = new Map()

  for (const block of incoming) {
    const previous = block._id ? existingById.get(String(block._id)) : null
    if (previous && isPublishedBlock(previous)) {
      matchedIds.add(String(previous._id))
      const groupId = entryIdForBlock(previous, existing)
      const meta = legacyEntryMeta(existing, previous)
      if (comparableBlock(previous) !== comparableBlock(block)) changedGroups.add(groupId)
      submittedGroupCounts.set(groupId, (submittedGroupCounts.get(groupId) || 0) + 1)
      records.push({ block, previous, groupId, meta })
    } else {
      records.push({ block, previous, groupId: null, meta: null })
    }
  }

  for (const previous of existingBlocks.filter(isPublishedBlock)) {
    const groupId = entryIdForBlock(previous, existing)
    if (!matchedIds.has(String(previous._id))) changedGroups.add(groupId)
  }

  const newRecords = records.filter((record) => !record.groupId)
  const existingRecords = records.filter((record) => record.groupId)
  const final = []
  const orderByGroup = new Map()

  for (const record of existingRecords) {
    const groupId = record.groupId
    const order = orderByGroup.get(groupId) || 0
    orderByGroup.set(groupId, order + 1)
    const changed = changedGroups.has(groupId)
    final.push(
      decorateEntryBlock(
        {
          ...record.block,
          created_at: record.previous.created_at || now,
        },
        {
          ...record.meta,
          entryId: new mongoose.Types.ObjectId(groupId),
          entryUpdatedAt: changed ? now : record.meta.entryUpdatedAt,
          entryVersion: changed
            ? Number(record.meta.entryVersion || 1) + 1
            : Number(record.meta.entryVersion || 1),
        },
        order,
        changed ? now : record.previous.updated_at || now,
      ),
    )
  }

  if (newRecords.length) {
    const entryId = new mongoose.Types.ObjectId()
    const meta = {
      entryId,
      publishedAt: publishedTimeForSelectedDay(resolved, tz, now),
      entryCreatedAt: now,
      entryUpdatedAt: now,
      entryVersion: 1,
    }
    newRecords.forEach((record, order) => {
      final.push(
        decorateEntryBlock(
          { ...record.block, created_at: record.previous?.created_at || now },
          meta,
          order,
          now,
        ),
      )
    })
  }

  if (final.length > maxBlocksPerPage) {
    return customError(`A day can contain up to ${maxBlocksPerPage} blocks.`, {}, 413)
  }
  if (final.filter((block) => block.type === "image").length > MAX_MEDIA_BLOCKS) {
    return customError(`A day can contain up to ${MAX_MEDIA_BLOCKS} media items.`, {}, 413)
  }

  const priorImageIds = new Set(imageIds(existingBlocks).map(String))
  const nextImageIds = imageIds(final)
  const newMediaIds = nextImageIds.filter((id) => !priorImageIds.has(String(id)))
  const mediaCheck = await validateNewMedia(newMediaIds, loggedUser, existing?._id)
  if (!mediaCheck.ok) return customError("One or more media items are unavailable.", {}, 400)

  const normalizedPrivacy = ALLOWED_PRIVACIES.has(privacy)
    ? privacy
    : existing?.privacy || "public"
  const hadPublishedContent = existingBlocks.some(isPublishedBlock)
  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $set: {
        date: resolved.date,
        privacy: normalizedPrivacy,
        blocks: final,
        status: "public",
        deletedAt: null,
        updated_at: now,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true, new: true },
  )

  const nextImageSet = new Set(nextImageIds.map(String))
  const removedMedia = imageIds(existingBlocks).filter((id) => !nextImageSet.has(String(id)))
  await releaseMedia(removedMedia, page._id)
  await claimMedia(newMediaIds, page, resolved.dateKey)
  if (!hadPublishedContent && final.length) {
    await updateStreak(loggedUser._id, tz).catch(() => null)
  }

  return created("DayPage", { data: await serializePage(page) })
}

async function updateBlock({ dateStr, entryId, blockId, update, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")
  if (!blockId || !mongoose.Types.ObjectId.isValid(blockId)) return invalidValue("blockId")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  if (!page) return notFound("DayPage")

  const block = page.blocks.find((candidate) => String(candidate._id) === String(blockId))
  if (!block || block.draftId) return notFound("Block")
  const groupId = entryIdForBlock(block, page)
  if (entryId && String(entryId) !== groupId) return notFound("Block")

  for (const [key, value] of Object.entries(update || {})) {
    if (!ALLOWED_BLOCK_UPDATES.has(key)) continue
    if (key === "completed" && block.type === "task") block.completed = value === true
    if (key === "title" && ["task", "event"].includes(block.type)) {
      const limit = block.type === "task" ? maxTaskTitleLength : maxEventTitleLength
      block.title = String(value || "").trim().slice(0, limit)
    }
    if (key === "content" && block.type === "text") {
      block.content = sanitizeHtml(String(value || ""), ALLOWED_HTML_OPTIONS)
        .slice(0, maxTextBlockLength)
    }
    if (key === "order" && Number.isFinite(Number(value))) block.order = Number(value)
  }

  const group = page.blocks.filter(
    (candidate) => isPublishedBlock(candidate) && entryIdForBlock(candidate, page) === groupId,
  )
  const version = Math.max(1, ...group.map((candidate) => Number(candidate.entryVersion) || 1)) + 1
  const now = new Date()
  for (const candidate of group) {
    const meta = legacyEntryMeta(page, candidate)
    candidate.entryId = new mongoose.Types.ObjectId(groupId)
    candidate.publishedAt = meta.publishedAt
    candidate.entryCreatedAt = meta.entryCreatedAt
    candidate.entryUpdatedAt = now
    candidate.entryVersion = version
    candidate.updated_at = now
  }
  page.updated_at = now
  page.markModified("blocks")
  await page.save()

  return updated("Block", { data: await serializePage(page) })
}

async function deleteDayPage({ dateStr, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const page = await DayPage.findOneAndUpdate(
    {
      user: loggedUser._id,
      dateKey: resolved.dateKey,
      status: { $ne: "deleted" },
    },
    { $set: { status: "deleted", deletedAt: new Date() } },
    { new: true },
  )
  if (!page) return notFound("DayPage")
  return deleted("DayPage", {})
}

async function getUserDayPage({ username, dateStr, loggedUser }) {
  const targetUser = await User.findOne({
    username,
    status: "public",
    banned: { $ne: true },
  })
  if (!targetUser) return notFound("User")

  const tz = targetUser.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const result = await DayPage.aggregate(
    getDayPagePipeline({
      userId: targetUser._id,
      dateKey: resolved.dateKey,
      loggedUser,
    }),
  )
  if (!result[0]) return notFound("DayPage")
  return fetched("DayPage", { data: await serializePage(result[0], { includeDrafts: false }) })
}

async function stageMedia({ dateStr, mediaDocs, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const page = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  }).lean()
  const currentMediaCount = (page?.blocks || []).filter(
    (block) => isPublishedBlock(block) && block.type === "image",
  ).length
  const available = Math.max(0, MAX_MEDIA_BLOCKS - currentMediaCount)
  const accepted = (mediaDocs || []).slice(0, available)
  const rejected = (mediaDocs || []).slice(available)

  if (rejected.length) {
    await Media.updateMany(
      { _id: { $in: rejected.map((doc) => doc._id) } },
      { $set: { status: "deleted", deletedAt: new Date() } },
    )
  }
  if (!accepted.length) {
    return customError(`A day can contain up to ${MAX_MEDIA_BLOCKS} media items.`, {}, 413)
  }

  await Media.updateMany(
    { _id: { $in: accepted.map((doc) => doc._id) } },
    {
      $set: {
        stagedFor: "DayPage",
        stagedDateKey: resolved.dateKey,
        usedIn: null,
      },
    },
  )
  const fresh = await Media.find({ _id: { $in: accepted.map((doc) => doc._id) } }).lean()
  return created("Staged media", { data: { media: serializeMediaPayload(fresh) } })
}

// Legacy media uploads remain visible to the owner as draft blocks. The next
// legacy PUT turns them and any new text/task/event blocks into one entry.
async function addMediaBlocks({ dateStr, mediaIds, loggedUser }) {
  const tz = loggedUser?.timeZone || defaultTimeZone
  const resolved = resolveDateKey(dateStr, tz)
  if (!resolved) return invalidValue("date")

  const validIds = (Array.isArray(mediaIds) ? mediaIds : [])
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)))
  if (!validIds.length) return invalidValue("mediaIds")

  const existing = await DayPage.findOne({
    user: loggedUser._id,
    dateKey: resolved.dateKey,
    status: { $ne: "deleted" },
  })
  const currentImageCount = (existing?.blocks || []).filter(
    (block) => block.type === "image",
  ).length
  const toAdd = validIds.slice(0, Math.max(0, MAX_MEDIA_BLOCKS - currentImageCount))
  if (!toAdd.length) return invalidValue("maxImages")

  const now = new Date()
  const draftId = `legacy-${new mongoose.Types.ObjectId()}`
  const newBlocks = toAdd.map((mediaId, order) => ({
    type: "image",
    mediaId,
    order,
    draftId,
    entryId: null,
    publishedAt: null,
    created_at: now,
    updated_at: now,
  }))
  const page = await DayPage.findOneAndUpdate(
    { user: loggedUser._id, dateKey: resolved.dateKey },
    {
      $push: { blocks: { $each: newBlocks } },
      $set: {
        date: resolved.date,
        status: "public",
        deletedAt: null,
        updated_at: now,
      },
      $setOnInsert: { created_at: now, privacy: "public" },
    },
    { upsert: true, new: true },
  )
  await Media.updateMany(
    { _id: { $in: toAdd } },
    {
      $set: {
        stagedFor: "DayPage",
        stagedDateKey: resolved.dateKey,
        usedIn: null,
      },
    },
  )
  return created("DayPage draft media", { data: await serializePage(page) })
}

async function addImageBlock({ dateStr, mediaId, loggedUser }) {
  return addMediaBlocks({ dateStr, mediaIds: [mediaId], loggedUser })
}

module.exports = {
  getOrInitDayPage,
  createEntry,
  updateEntry,
  deleteEntry,
  updatePrivacy,
  upsertDayPage,
  updateBlock,
  deleteDayPage,
  getUserDayPage,
  stageMedia,
  addImageBlock,
  addMediaBlocks,
}
