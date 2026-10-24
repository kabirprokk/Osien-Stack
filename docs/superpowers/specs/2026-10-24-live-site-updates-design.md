# Live update information for Osien Stack and OCM

## Intent

Show visitors the current Osien Stack and OCM catalog state, with copyable
install or update instructions. The pages must not imply that they can update
software already installed on a visitor's machine.

## Goals and constraints

- Osien Stack shows its current MCP version, live tool count, latest source
  update, and install/update instructions. Its tool explorer uses the current
  MCP tool catalog rather than a separately maintained list.
- OCM shows the latest registry package counts and `updated` date, plus the
  command to update the OCM CLI.
- Both sites retain their built-in snapshot if GitHub data cannot be fetched.
- Osien Stack is a static GitHub Pages site. OCM is a Next.js static export on
  Cloudflare Pages. Neither site has a server endpoint for live metadata.
- The sites display instructions only; they never execute an install or update
  on the visitor's machine.

## Approaches

1. **Fetch public source data when a visitor opens the page (chosen).** Read
   Osien's MCP package metadata and `tools.json` from the repository, and read
   OCM's `registry.json` from its public registry. Keep the built-in values as
   fallback content. This avoids deploy credentials and cross-repository
   triggers, and new source changes appear without rebuilding either site.
2. **Generate snapshots and trigger site deployments.** Update static metadata
   from source-repository workflows, then deploy each site. This avoids
   visitor-time data requests, but OCM requires cross-repository deploy
   coordination and credentials, and Osien still needs generated tool data.

## Implementation calls

- Fetch only public GitHub data, with bounded timeouts and validation before
  updating the page.
- Show a source update date or commit identifier only when the source provides
  a valid value; otherwise retain the fallback label.
- Preserve current site navigation, styling, install flows, and package
  installation behavior.
- Keep the current offline/static content usable before the live request
  completes and when the request fails.

## Non-goals

- Automatically updating an installed Osien Stack or OCM copy.
- Adding authentication, secrets, a database, or a new deployment platform.
- Changing release/versioning policy for either repository.
