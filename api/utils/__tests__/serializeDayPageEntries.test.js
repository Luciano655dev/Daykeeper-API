const { addDayPageEntries } = require("../serializeMediaPayload")

describe("addDayPageEntries", () => {
  test("groups blocks into newest-first entries and sorts blocks within each entry", () => {
    const page = addDayPageEntries({
      _id: "page",
      dateKey: "2026-07-27",
      created_at: "2026-07-27T10:00:00.000Z",
      blocks: [
        {
          _id: "b2",
          entryId: "early",
          publishedAt: "2026-07-27T10:00:00.000Z",
          entryCreatedAt: "2026-07-27T10:00:00.000Z",
          entryUpdatedAt: "2026-07-27T10:00:00.000Z",
          order: 1,
          type: "task",
        },
        {
          _id: "b3",
          entryId: "late",
          publishedAt: "2026-07-27T18:30:00.000Z",
          entryCreatedAt: "2026-07-27T18:30:00.000Z",
          entryUpdatedAt: "2026-07-27T18:32:00.000Z",
          entryVersion: 2,
          order: 0,
          type: "text",
        },
        {
          _id: "b1",
          entryId: "early",
          publishedAt: "2026-07-27T10:00:00.000Z",
          entryCreatedAt: "2026-07-27T10:00:00.000Z",
          entryUpdatedAt: "2026-07-27T10:00:00.000Z",
          order: 0,
          type: "text",
        },
      ],
    })

    expect(page.entries.map((entry) => entry._id)).toEqual(["late", "early"])
    expect(page.entries[0]).toMatchObject({ version: 2, edited: true })
    expect(page.entries[1].blocks.map((block) => block._id)).toEqual(["b1", "b2"])
  })

  test("keeps legacy blocks together and excludes unpublished draft blocks", () => {
    const page = addDayPageEntries({
      _id: "legacy-page",
      dateKey: "2026-07-27",
      created_at: "2026-07-27T10:00:00.000Z",
      blocks: [
        { _id: "published", order: 0, type: "text" },
        { _id: "draft", order: 1, type: "image", draftId: "draft-1" },
      ],
    })

    expect(page.entries).toHaveLength(1)
    expect(page.entries[0]._id).toBe("legacy-page")
    expect(page.entries[0].blocks.map((block) => block._id)).toEqual(["published"])
  })
})
