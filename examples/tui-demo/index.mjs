// OpenTUI demo — flexbox + interactive widgets + keyboard handling
// Run: npm install && npm start
// Requires: Node 18+, @opentui/core

import { createCliRenderer, Box, Text, Select, Input, ScrollBox } from "@opentui/core";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

// Main container — flexbox column
const root = new Box({ flexDirection: "column", width: "100%", height: "100%", padding: 1 });

// Header
const header = new Box({ height: 3, borderStyle: "round", borderColor: "#4a90d9", padding: 1 });
header.add(new Text({ content: "Osien-Stack TUI Demo — OpenTUI", fg: "#4a90d9", bold: true }));
root.add(header);

// Body — two columns
const body = new Box({ flexDirection: "row", flexGrow: 1, gap: 1, marginTop: 1 });
root.add(body);

// Left panel — scrollable list
const leftPanel = new Box({ width: "40%", borderStyle: "single", borderColor: "#555", padding: 1, flexDirection: "column" });
leftPanel.add(new Text({ content: "Files", fg: "#aaa", bold: true }));
const scrollBox = new ScrollBox({ flexGrow: 1 });
const files = ["AGENTS.md", "README.md", "CLAUDE.md", "LICENSE", "package.json", "server.js", "index.html"];
for (const f of files) {
  scrollBox.add(new Text({ content: "  " + f, fg: "#ccc" }));
}
leftPanel.add(scrollBox);
body.add(leftPanel);

// Right panel — input + select
const rightPanel = new Box({ width: "60%", borderStyle: "single", borderColor: "#555", padding: 1, flexDirection: "column", gap: 1 });
rightPanel.add(new Text({ content: "Actions", fg: "#aaa", bold: true }));

const input = new Input({ placeholder: "Type a command...", width: "100%" });
rightPanel.add(input);

const select = new Select({
  options: [
    { label: "Build", value: "build" },
    { label: "Test", value: "test" },
    { label: "Deploy", value: "deploy" },
    { label: "Lint", value: "lint" },
  ],
  width: "100%",
});
rightPanel.add(select);

const status = new Text({ content: "Ready. Press Ctrl+C to exit.", fg: "#2ecc71" });
rightPanel.add(status);

body.add(rightPanel);

// Footer
const footer = new Box({ height: 2, borderStyle: "single", borderColor: "#333", padding: 1 });
footer.add(new Text({ content: "OpenTUI v0.6+ | Flexbox | Keyboard+Mouse | MIT License", fg: "#666" }));
root.add(footer);

renderer.root.add(root);
renderer.start();

// Keyboard handling
renderer.on("keypress", (key) => {
  if (key.name === "q") renderer.destroy();
});
