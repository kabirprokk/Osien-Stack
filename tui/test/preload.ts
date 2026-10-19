/**
 * Bun preload for the renderer tests.
 *
 * `@opentui/solid/bun-plugin` is the official transform OpenTUI ships: it runs
 * `babel-preset-solid` with `generate: "universal"` and `moduleName:
 * "@opentui/solid"`, and it rewrites `solid-js/dist/server.js` to
 * `dist/solid.js` on load. That rewrite is the important part - `solid-js`
 * resolves to its **server** build under the `node` export condition, which has
 * no fine-grained reactivity, so a test run on plain Node would silently prove
 * nothing about the host's reactive behaviour.
 */
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"

ensureSolidTransformPlugin()