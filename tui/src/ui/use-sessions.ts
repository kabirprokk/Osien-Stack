import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js"

import type { Context } from "@opencode/plugin/tui/context"

import { LIST_LIMIT } from "../core/constants.ts"
import { buildSessionModels, type RawSession, type SessionModelResult } from "../core/model.ts"

/** Host `SessionInfo` narrowed to the fields this plugin reads. */
function toRaw(session: {
  id: string
  parentID?: string | undefined
  title?: string | undefined
  time: { updated: number; archived?: number | undefined }
}): RawSession {
  return {
    id: session.id,
    parentID: session.parentID,
    title: session.title,
    updated: session.time.updated,
    archived: session.time.archived === undefined ? false : true,
  }
}

export interface SessionFeed {
  readonly models: Accessor<SessionModelResult>
  /** Bumped by every server event whose type starts with `session.`. */
  readonly revision: Accessor<number>
  /** Re-reads the host cache. Cheap: the host store is already live-synced. */
  readonly refresh: () => void
}

/**
 * Subscribes to session activity and derives the display model.
 *
 * The host already keeps `data.session.list()` live, so this does not poll and
 * does not call the network: it re-derives on demand and bumps a signal when a
 * `session.*` event arrives. Event *names* are matched by prefix so no event id
 * has to be invented.
 */
export function createSessionFeed(ctx: Context, limit = LIST_LIMIT): SessionFeed {
  const [revision, setRevision] = createSignal(0)

  const stop = ctx.data.listen(({ details }) => {
    if (String(details.type).startsWith("session.")) setRevision((value) => value + 1)
  })
  onCleanup(stop)

  const models = createMemo<SessionModelResult>(() => {
    // Track the event revision so the memo re-derives on server activity even
    // when the host store identity is unchanged.
    revision()
    try {
      const raw = ctx.data.session.list().map(toRaw)
      return buildSessionModels(raw, {
        status: (id) => ctx.data.session.status(id),
        cost: (id) => ctx.data.session.cost(id),
        limit,
        maxDepth: 2,
      })
    } catch (error) {
      return {
        rows: [],
        stats: { total: 0, visible: 0, running: 0, archived: 0 },
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  return { models, revision, refresh: () => setRevision((value) => value + 1) }
}