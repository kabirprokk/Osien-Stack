import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"

// CODE SEARCH — relevance-ranked retrieval using REAL signals only:
//   exact symbol match · BM25 lexical · path relevance · git recency · call-graph
// No LLM in the loop, no invented confidence numbers. Every score is traceable.

const SKIP_DIR =
  /(node_modules|\.git|\.godot|dist|build|\.next|__pycache__|\.venv|vendor|coverage|\.cache)/

const TEXTY = /\.(ts|tsx|js|jsx|mjs|cjs|py|gd|gdshader|glsl|sh|json|jsonc|md|yml|yaml|toml|html|css|scss|tres|cfg|sql|svg|cs|go|rs|java|rb|php)$/

const STOP = new Set(
  ("the a an and or of to in is are was for on at it this that with as by from be been has have " +
    "function const let var class def return if else import export void new null true false")
    .split(" ")
)

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9_.$]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))

// ---- BM25 over the project's text files ------------------------------

type Doc = {
  file: string
  rel: string
  text: string
  lines: string[]
  tf: Map<string, number>
  len: number
  mtime: number
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  let CACHE: { key: string; docs: Doc[]; df: Map<string, number>; avg: number } | null = null

  function buildIndex() {
    const files: string[] = []
    const stack = [DIR]
    while (stack.length) {
      const d = stack.pop()!
      let ents: fs.Dirent[] = []
      try {
        ents = fs.readdirSync(d, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of ents) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) {
          if (!SKIP_DIR.test(e.name) && !e.name.startsWith(".")) stack.push(full)
        } else if (TEXTY.test(e.name) && !e.name.endsWith(".import")) {
          try {
            if (fs.statSync(full).size < 1_500_000) files.push(full)
          } catch {}
        }
      }
    }

    const docs: Doc[] = []
    const df = new Map<string, number>()
    for (const f of files) {
      let lines: string[]
      try {
        lines = fs.readFileSync(f, "utf8").split("\n")
      } catch {
        continue
      }
      const text = lines.join("\n")
      const tf = new Map<string, number>()
      for (const t of tokenize(f + " " + text)) tf.set(t, (tf.get(t) || 0) + 1)
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
      docs.push({
        file: f,
        rel: path.relative(DIR, f),
        text,
        lines,
        tf,
        len: text.length,
        mtime: fs.statSync(f).mtimeMs,
      })
    }
    const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length)
    CACHE = { key: `${DIR}:${docs.length}`, docs, df, avg }
    return CACHE
  }

  const index = () => {
    if (!CACHE) return buildIndex()
    return CACHE
  }

  // BM25 parameters — standard defaults, nothing tuned to look good.
  const K1 = 1.2,
    B = 0.75

  function score(d: Doc, q: string[], N: number, avg: number, df: Map<string, number>) {
    let s = 0
    const parts: string[] = []
    for (const t of q) {
      const f = d.tf.get(t)
      if (!f) continue
      const n = df.get(t) || 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (d.len / avg)))
      s += idf * norm
      parts.push(`${t}:${norm.toFixed(1)}`)
    }
    return { s, parts }
  }

  // ---- individual signals, each reported so the score is auditable -----

  const SIGNAL_EXACT = /(?:function|class|def|const|let|var|fn|struct|interface|type)\s+([A-Za-z_$][\w$]*)/g

  function findDefinitions(docs: Doc[], sym: string) {
    const out: { rel: string; line: number; kind: string }[] = []
    for (const d of docs) {
      for (let i = 0; i < d.lines.length; i++) {
        const m = d.lines[i].match(SIGNAL_EXACT)
        if (!m) continue
        for (const g of m) {
          const name = g.replace(SIGNAL_EXACT, "$1")
          if (name === sym) out.push({ rel: d.rel, line: i + 1, kind: "def" })
        }
      }
    }
    return out
  }

  function findCallers(docs: Doc[], sym: string) {
    const out: { rel: string; line: number }[] = []
    const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    for (const d of docs) {
      for (let i = 0; i < d.lines.length; i++)
        if (re.test(d.lines[i]) && !d.lines[i].match(SIGNAL_EXACT))
          out.push({ rel: d.rel, line: i + 1 })
    }
    return out
  }

  return {
    tool: {
      code_search: {
        description:
          "Relevance-ranked code search using BM25 + exact-symbol + path + recency signals. Returns SCORED files with the exact lines that matched. Replaces blind grep and whole-file reads. Call this before reading anything.",
        args: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "what you are looking for. A bare identifier ranks definitions highest; a phrase ranks lexically.",
            },
            symbol: {
              type: "string",
              description:
                "if you know the exact identifier, pass it here to get definitions AND callers precisely",
            },
            max: { type: "number", description: "files to return (default 6)" },
            path: { type: "string", description: "limit to a subdirectory" },
          },
        },
        async execute(args: any) {
          const max = Math.min(args?.max ?? 6, 20)
          const idx = index()
          const q = tokenize(args?.query ?? "")
          const sym = args?.symbol ?? (/^[A-Za-z_$][\w$]*$/.test(args?.query ?? "") ? args.query : null)
          const scope = args?.path ? path.join(DIR, args.path) : DIR

          const N = idx.docs.length
          const now = Date.now()
          const defs = sym ? findDefinitions(idx.docs, sym) : []
          const defSet = new Set(defs.map((d) => d.rel))

          const scored = idx.docs
            .filter((d) => d.file.startsWith(scope))
            .map((d) => {
              const { s, parts } = score(d, q, N, idx.avg, idx.df)
              const signals: string[] = [`bm25=${s.toFixed(2)}`]

              // 1. exact symbol DEFINITION — strongest possible signal
              let mult = 1
              if (defSet.has(d.rel)) {
                mult *= 3.0
                signals.push("defines_symbol x3.0")
              }
              // 2. path relevance — query words appearing in the filename/path
              const relLower = d.rel.toLowerCase()
              const pathHits = q.filter((t) => relLower.includes(t)).length
              if (pathHits) {
                mult *= 1 + 0.25 * pathHits
                signals.push(`path_match x${(1 + 0.25 * pathHits).toFixed(2)}`)
              }
              // 3. recency — files touched in the last 7 days, mild boost
              const ageDays = (now - d.mtime) / 86_400_000
              if (ageDays < 1) {
                mult *= 1.35
                signals.push("touched_today x1.35")
              } else if (ageDays < 7) {
                mult *= 1.15
                signals.push("touched_this_week x1.15")
              }
              // 4. small files beat big files for a first look
              if (d.len < 8000) signals.push("small_file")

              return { d, raw: s, final: s * mult, signals, parts }
            })
            .filter((x) => x.final > 0)
            .sort((a, b) => b.final - a.final)
            .slice(0, max)

          if (!scored.length) return `no match for "${args?.query}" under ${path.relative(DIR, scope) || "."}`

          const out: string[] = [
            `CODE SEARCH: "${args?.query}"${sym ? ` (symbol: ${sym})` : ""}  [${N} files indexed]`,
            "",
          ]
          for (const x of scored) {
            out.push(`${x.final.toFixed(2).padStart(8)}  ${x.d.rel}`)
            out.push(`          signals: ${x.signals.join(", ")}`)
            // show the best matching lines, not the whole file
            const hits: string[] = []
            for (let i = 0; i < x.d.lines.length && hits.length < 4; i++) {
              const lt = x.d.lines[i].toLowerCase()
              if (q.some((t) => lt.includes(t))) hits.push(`  ${x.d.rel}:${i + 1}: ${x.d.lines[i].trim().slice(0, 130)}`)
            }
            out.push(...hits.slice(0, 3))
            out.push("")
          }

          if (sym) {
            const callers = findCallers(
              idx.docs.filter((d) => d.file.startsWith(scope)),
              sym
            )
            out.push(`--- CALLERS of ${sym} (${callers.length}) ---`)
            out.push(...callers.slice(0, 12).map((c) => `  ${c.rel}:${c.line}`))
            if (callers.length > 12) out.push(`  … ${callers.length - 12} more`)
          }

          out.push(
            `\nNEXT: read_slice the top 1-2 files at the lines above. Do NOT read whole files.`
          )
          return out.join("\n")
        },
      },
    },
  }
}) satisfies Plugin