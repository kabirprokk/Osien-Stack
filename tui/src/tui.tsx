import { Plugin } from "@opencode/plugin/tui"

import { BIND, CMD, PLUGIN_ID, SLASH, WORKSPACE_ROUTE } from "./core/constants.ts"
import { relativeAge } from "./core/format.ts"
import { openSession, type RouteLike } from "./core/navigation.ts"
import { ComposerTop } from "./parts/composer-top.tsx"
import { HomeFooter } from "./parts/home-footer.tsx"
import { SidebarContent } from "./parts/sidebar.tsx"
import { Workspace } from "./routes/workspace.tsx"
import { createNavMemory } from "./ui/nav-memory.ts"

/** Cleanup that runs at most once, so host auto-disposal cannot double-fire. */
function once(fn: () => void): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}

export default Plugin.define({
  id: PLUGIN_ID,
  setup(ctx) {
    const memory = createNavMemory(ctx)

    const openSessionByID = (sessionID: string) =>
      openSession({
        sessionID,
        focusTab: (id) => ctx.ui.tabs.focus(id),
        navigate: (destination) => ctx.ui.router.navigate(destination),
      })

    const toggleWorkspace = () => {
      const current = ctx.ui.router.current()
      if (current.type === "plugin" && current.name === WORKSPACE_ROUTE) {
        ctx.ui.router.navigate(memory.back())
        return
      }
      memory.remember(current as RouteLike)
      ctx.ui.router.navigate({ type: "plugin", name: WORKSPACE_ROUTE })
    }

    const pickSession = async () => {
      const sessions = ctx.data.session.list()
      if (sessions.length === 0) {
        ctx.ui.toast.show({ message: "no sessions yet", variant: "info" })
        return
      }
      const now = Date.now()
      const chosen = await ctx.ui.dialog.select<string>({
        title: "Open session",
        placeholder: "filter sessions",
        options: sessions.map((session) => ({
          title: session.title?.trim() || session.id,
          value: session.id,
          description: relativeAge(session.time.updated, now),
          category: session.parentID ? "sub-session" : "root",
        })),
        search: (query, options) => {
          const needle = query.trim().toLowerCase()
          if (!needle) return options
          return options.filter((option) => option.title.toLowerCase().includes(needle))
        },
      })
      if (!chosen) return
      if (openSessionByID(chosen) === "rejected") {
        ctx.ui.toast.show({ message: "could not open that session", variant: "error" })
      }
    }

    // Global layer: these bindings must work from the chat view, the home
    // screen and the workspace alike. The host removes the layer on plugin
    // disable, reload or setup failure, so hot reload leaves no residue.
    ctx.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: CMD.openWorkspace,
          title: "OSIEN: workspace dashboard",
          description: "Open the OSIEN workspace overview",
          group: "OSIEN",
          bind: BIND.openWorkspace,
          palette: true,
          slash: { name: SLASH.workspace, aliases: ["workspace"] },
          suggested: true,
          run: toggleWorkspace,
        },
        {
          id: CMD.openSession,
          title: "OSIEN: open session",
          description: "Filter and open a session from the project",
          group: "OSIEN",
          bind: BIND.openSession,
          palette: true,
          run: () => void pickSession(),
        },
      ],
    }))

    const unregisterRoute = ctx.ui.router.register({
      name: WORKSPACE_ROUTE,
      render: () => <Workspace ctx={ctx} />,
    })

    const releaseRoute = once(unregisterRoute)
    const releases = [
      releaseRoute,
      once(
        ctx.ui.slot({
          // Only the sidebar's session area is replaced. The native transcript
          // and composer are outside this boundary and stay as shipped.
          replace: "sidebar.content",
          render: (input) => <SidebarContent ctx={ctx} sessionID={input.sessionID} />,
        }),
      ),
      once(
        ctx.ui.slot({
          append: "session.composer.top",
          render: (input) => <ComposerTop ctx={ctx} sessionID={input.sessionID} />,
        }),
      ),
      once(ctx.ui.slot({ append: "home.footer", render: () => <HomeFooter ctx={ctx} /> })),
    ]

    return () => {
      for (const release of releases.reverse()) release()
    }
  },
})