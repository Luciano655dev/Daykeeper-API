const TrustedDevice = require("../../models/TrustedDevice")
const {
  errors: { unauthorized },
  success: { fetched },
  maxPageSize: DEFAULT_MAX_PAGE_SIZE,
} = require("../../../constants/index")

// Lists the user's active (non-expired) trusted devices — the ones that skip
// 2FA at login. Mirrors getDeviceSessions' shape.
const getTrustedDevices = async (props) => {
  const { loggedUser, page, maxPageSize } = props

  if (!loggedUser?._id) return unauthorized("fetch trusted devices")

  let p = Number(page)
  let size = Number(maxPageSize)

  if (!Number.isFinite(p) || p < 1) p = 1
  if (!Number.isFinite(size) || size < 1) size = DEFAULT_MAX_PAGE_SIZE
  size = Math.min(size, DEFAULT_MAX_PAGE_SIZE)

  const skipCount = (p - 1) * size
  const query = {
    user: loggedUser._id,
    expiresAt: { $gt: new Date() },
  }

  const totalCount = await TrustedDevice.countDocuments(query)
  const rows = await TrustedDevice.find(query)
    .sort({ lastUsedAt: -1 })
    .skip(skipCount)
    .limit(size)
    .select("label ip userAgent lastUsedAt createdAt expiresAt")
    .lean()

  const data = rows.map((row) => {
    const { _id, ...rest } = row
    return { ...rest, id: _id }
  })

  const totalPages = totalCount ? Math.ceil(totalCount / size) : 0

  return fetched("trusted devices", {
    response: {
      data,
      page: p,
      pageSize: data.length,
      maxPageSize: size,
      totalPages,
      totalCount,
    },
  })
}

module.exports = getTrustedDevices
