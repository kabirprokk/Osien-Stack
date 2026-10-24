# Osien Stack website live updates implementation plan

This plan updates the static GitHub Pages site to show current public
repository data without attempting to modify a visitor's local installation.

## Task 1: Add a shared live-source status and update panel

**Files:** `docs/index.html`

1. Identify the current hero/install sections and retain the existing layout and
   styling.
2. Add a semantic update panel with version, tool count, source update date,
   install/update command, and a copy button.
3. Keep current fallback values in the HTML so the page remains useful before
   JavaScript runs and when GitHub is unavailable.
4. Fetch the public `mcp-server/package.json`, `mcp-server/tools.json`, and
   latest commit metadata for the Osien Stack repository on page load.
5. Validate the JSON shapes and date before replacing fallback values. Use a
   bounded timeout and preserve fallback values on any fetch or validation
   failure.
6. Show a clear source freshness label and make the copy action keyboard
   accessible, with a visible copied/error status.

**Verification:** Load the page with a successful mocked response, an invalid
response, and a failed request. Confirm live values render only for valid data,
the fallback remains in the other cases, and copy works with keyboard and
pointer input.

## Task 2: Make the tool explorer use the live MCP catalog

**Files:** `docs/tools.html`

1. Replace the separately maintained inline `tools` array with the current
   public `mcp-server/tools.json` source, retaining the existing array as a
   fallback.
2. Map source `name` and `desc` fields into the explorer's existing name and
   description display model. Preserve existing category behavior where the
   source does not provide categories.
3. Update the page title/description and visible tool count from the validated
   catalog, while keeping fallback copy for offline use.
4. Apply the same timeout, validation, and failure behavior as the home page.

**Verification:** Check that all catalog entries appear, search/filter and
deep-link behavior still work, and a failed fetch leaves the existing explorer
usable.

## Task 3: Verify the static site changes

**Files:** `docs/index.html`, `docs/tools.html`

1. Run JavaScript syntax checks on extracted inline scripts or the repository's
   existing validation commands, if available.
2. Serve `docs/` locally and verify both pages at desktop and mobile widths.
3. Confirm the pages make no request that can install or update software on the
   visitor's machine.
4. Review the diff and verify the pre-existing
   `osien-stack-work/mcp-server/package-lock.json` modification remains
   untouched.
