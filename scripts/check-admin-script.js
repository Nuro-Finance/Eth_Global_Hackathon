#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// ─────────────────────────────────────────────────────────────────────────────
// Admin <script> parse gate — pre-push protection against the S33 regression
// class where escape-sequence mishandling inside the outer dashboardHTML
// template literal silently corrupted the inner JS, blanking the dashboard.
// (See Decision Journal 2026-04-26_002 DJ 4.)
//
// Strategy:
//   1. AST-parse src/admin-console.ts via the TypeScript compiler API.
//   2. Locate the `dashboardHTML` function and its return TemplateExpression.
//   3. Concatenate the template's resolved `.text` parts, replacing each
//      `${...}` interpolation with a safe string-literal placeholder. The
//      compiler's `.text` field is the COOKED (escape-resolved) string —
//      exactly what the runtime would produce — so any `\'` mistake in
//      source surfaces here as a bare `'` that breaks downstream JS parsing.
//   4. Extract every `<script>...</script>` block from the rendered HTML.
//   5. Run `node --check` on each block. A failure means a regression of
//      the same class shipped — block the push.
//
// Exit codes:
//   0  — all script blocks parse cleanly
//   1  — at least one script block has a syntax error (the bug we guard against)
//   2  — admin-console.ts couldn't be parsed (sanity failure)
//   3  — couldn't locate dashboardHTML or extract script blocks (gate broken)
//
// Failure mode prefers FALSE NEGATIVE on environment glitches (couldn't load
// the typescript package, etc.) — we exit 0 with a warning so the gate never
// becomes a flaky push-blocker. The real backstop for those is CI.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(ROOT, 'src', 'admin-console.ts')

let ts
try {
  ts = require(path.join(ROOT, 'node_modules', 'typescript'))
} catch {
  console.warn('[heim:admin-script-gate] typescript package not resolvable — skipping (CI will catch)')
  process.exit(0)
}

let source
try {
  source = fs.readFileSync(SOURCE_PATH, 'utf8')
} catch (err) {
  console.error(`[heim:admin-script-gate] cannot read ${SOURCE_PATH}: ${err.message}`)
  process.exit(2)
}

const sf = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS)

let dashboardFn = null
ts.forEachChild(sf, (node) => {
  if (ts.isFunctionDeclaration(node) && node.name && node.name.text === 'dashboardHTML') {
    dashboardFn = node
  }
})
if (!dashboardFn) {
  console.error('[heim:admin-script-gate] could not locate function dashboardHTML in admin-console.ts')
  process.exit(3)
}

let templateExpr = null
;(function visit(node) {
  if (ts.isReturnStatement(node) && node.expression) {
    if (ts.isTemplateExpression(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) {
      templateExpr = node.expression
      return
    }
  }
  ts.forEachChild(node, visit)
})(dashboardFn)
if (!templateExpr) {
  console.error('[heim:admin-script-gate] dashboardHTML has no return-template-literal we can render')
  process.exit(3)
}

// Build the rendered HTML. `.text` on each piece is the COOKED string —
// escape sequences already applied. Interpolations get a safe placeholder
// that's a bare identifier (NOT a quoted string), since the source code
// often already wraps `${...}` in quotes (e.g. `KEY = '${adminKey}';`).
// A bare identifier is valid in every position the dashboard uses an
// interpolation: inside string literals (resulting in `'__I__'`), as
// expression operands, as property accesses, as variable initializers.
const PLACEHOLDER = '__I__'
let rendered
if (ts.isNoSubstitutionTemplateLiteral(templateExpr)) {
  rendered = templateExpr.text
} else {
  rendered = templateExpr.head.text
  for (const span of templateExpr.templateSpans) {
    rendered += PLACEHOLDER
    rendered += span.literal.text
  }
}

// Extract every <script>...</script> block. Skip type=text/html templates
// and anything else that isn't real JS.
const blocks = []
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/g
let m
while ((m = scriptRe.exec(rendered)) !== null) {
  const attrs = m[1] || ''
  const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/)
  if (typeMatch && !/^(text\/javascript|application\/javascript|module)$/i.test(typeMatch[1])) {
    continue
  }
  // Approximate line in source for forensics on failure.
  const upTo = rendered.slice(0, m.index)
  blocks.push({ source: m[2], approxRenderedLine: upTo.split('\n').length })
}

if (blocks.length === 0) {
  console.error('[heim:admin-script-gate] no <script> blocks extracted from dashboardHTML output')
  process.exit(3)
}

let failed = 0
const keptForInspection = []
for (let i = 0; i < blocks.length; i++) {
  const tmp = path.join(os.tmpdir(), `check-admin-block-${process.pid}-${i}.js`)
  fs.writeFileSync(tmp, blocks[i].source)
  const r = spawnSync('node', ['--check', tmp], { encoding: 'utf8' })
  if (r.status !== 0) {
    failed++
    console.error(`[heim:admin-script-gate] BLOCK #${i + 1} (rendered line ~${blocks[i].approxRenderedLine}) parse FAILED:`)
    console.error('  ' + (r.stderr || r.stdout || '(no output)').trim().split('\n').slice(0, 6).join('\n  '))
    keptForInspection.push(tmp)
  } else {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

if (failed > 0) {
  console.error('')
  console.error(`[heim:admin-script-gate] FAIL — ${failed}/${blocks.length} <script> block(s) failed node --check`)
  console.error("  This is the S33 regression class — \\' inside the outer dashboardHTML template")
  console.error('  silently corrupts inner JS string literals. Common fix: replace \\\' with \\\\\' in source.')
  console.error('  Reference: Decision Journal 2026-04-26_002 DJ 4')
  if (keptForInspection.length > 0) {
    console.error('  Temp files preserved for inspection:')
    for (const f of keptForInspection) console.error('    ' + f)
  }
  process.exit(1)
}

console.log(`[heim:admin-script-gate] OK — ${blocks.length} <script> block(s) parse clean (rendered ${rendered.length.toLocaleString()} bytes)`)
process.exit(0)
