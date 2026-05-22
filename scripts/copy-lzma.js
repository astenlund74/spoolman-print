// Adapted from supvan-t50-pro-webhid/scripts/copy-lzma.js
// Copies lzma browser files to public/vendor/ and patches lzma_worker.js.
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const vendorDir = path.join(rootDir, 'public', 'vendor')
const lzmaRoot = path.join(rootDir, 'node_modules', 'lzma')
const browserRoot = path.join(lzmaRoot, 'src')

function walk(dir, matches) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, matches)
      continue
    }
    if (entry.name === 'lzma.js' || entry.name === 'lzma_worker.js') {
      matches.push(fullPath)
    }
  }
}

function pickFile(matches, filename) {
  const found = matches.find((p) => path.basename(p) === filename)
  if (!found) throw new Error(`Unable to locate ${filename} inside node_modules/lzma`)
  return found
}

if (!fs.existsSync(lzmaRoot)) {
  throw new Error('node_modules/lzma not found. Run `npm install` first.')
}

let lzmaJs
let lzmaWorker

if (fs.existsSync(browserRoot)) {
  lzmaJs = path.join(browserRoot, 'lzma.js')
  lzmaWorker = path.join(browserRoot, 'lzma_worker.js')
}

if (!lzmaJs || !fs.existsSync(lzmaJs) || !fs.existsSync(lzmaWorker)) {
  const matches = []
  walk(lzmaRoot, matches)
  lzmaJs = pickFile(matches, 'lzma.js')
  lzmaWorker = pickFile(matches, 'lzma_worker.js')
}

fs.mkdirSync(vendorDir, { recursive: true })
fs.copyFileSync(lzmaJs, path.join(vendorDir, 'lzma.js'))
fs.copyFileSync(lzmaWorker, path.join(vendorDir, 'lzma_worker.js'))

// Patch lzma_worker.js to support custom lc/lp/pb LZMA parameters.
const workerPath = path.join(vendorDir, 'lzma_worker.js')
let workerText = fs.readFileSync(workerPath, 'utf8')

workerText = workerText.replace(
  /\/\/\/ lc is always 3[\s\S]*?encoder\._posStateMask = 3;/,
  [
    '        var lc, lp, pb;',
    '        /// Defaults match original behavior (lc=3, lp=0, pb=2) unless overridden.',
    '        lc = typeof this$static.lc == "number" ? this$static.lc : 3;',
    '        lp = typeof this$static.lp == "number" ? this$static.lp : 0;',
    '        pb = typeof this$static.pb == "number" ? this$static.pb : 2;',
    '        encoder._numLiteralPosStateBits = lp;',
    '        encoder._numLiteralContextBits = lc;',
    '        encoder._posStateBits = pb;',
    '        ///this$static._posStateMask = (1 << pb) - 1;',
    '        encoder._posStateMask = (1 << pb) - 1;',
  ].join('\n')
)

workerText = workerText.replace(
  /var LZMA = \(function \(\) \{/,
  'var LZMA = (function () {\n    LZMA = {};\n    LZMA.disableEndMark = true;'
)

workerText = workerText.replace(
  /return function \(mode\) \{\n\s*return modes\[mode - 1\] \|\| modes\[6\];\n\s*\};/,
  [
    'return function (mode) {',
    '            if (mode && typeof mode === "object") {',
    '                return mode;',
    '            }',
    '            return modes[mode - 1] || modes[6];',
    '        };',
  ].join('\n')
)

fs.writeFileSync(workerPath, workerText)
console.log('Copied and patched lzma.js + lzma_worker.js → public/vendor/')
