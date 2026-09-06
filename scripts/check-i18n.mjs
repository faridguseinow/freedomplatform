import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')
const localesRoot = path.join(sourceRoot, 'lib/i18n/locales')
const ru = JSON.parse(fs.readFileSync(path.join(localesRoot, 'ru.json'), 'utf8'))
const az = JSON.parse(fs.readFileSync(path.join(localesRoot, 'az.json'), 'utf8'))
const sourceMap = JSON.parse(fs.readFileSync(path.join(localesRoot, 'source-map.json'), 'utf8'))
Object.assign(ru, JSON.parse(fs.readFileSync(path.join(localesRoot, 'manual.ru.json'), 'utf8')))
Object.assign(az, JSON.parse(fs.readFileSync(path.join(localesRoot, 'manual.az.json'), 'utf8')))
Object.assign(sourceMap, JSON.parse(fs.readFileSync(path.join(localesRoot, 'manual-source-map.json'), 'utf8')))
const errors = []

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(entryPath) : [entryPath]
  })
}

for (const key of new Set([...Object.keys(ru), ...Object.keys(az)])) {
  if (!(key in ru)) errors.push(`Missing Russian value: ${key}`)
  if (!(key in az)) errors.push(`Missing Azerbaijani value: ${key}`)
  if (!String(ru[key] ?? '').trim()) errors.push(`Empty Russian value: ${key}`)
  if (!String(az[key] ?? '').trim()) errors.push(`Empty Azerbaijani value: ${key}`)
  if (/[А-Яа-яЁё]/.test(String(az[key] ?? ''))) errors.push(`Cyrillic leaked into Azerbaijani value: ${key}`)
}

for (const [source, key] of Object.entries(sourceMap)) {
  if (!(key in ru) || !(key in az)) errors.push(`Broken source mapping: ${source} -> ${key}`)
}

for (const filePath of walk(sourceRoot).filter((file) => /\.tsx?$/.test(file) && !file.includes('/lib/i18n/'))) {
  const text = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  function report(node, message) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    errors.push(`${path.relative(root, filePath)}:${position.line + 1} ${message}`)
  }

  function visit(node) {
    if (ts.isStringLiteralLike(node) && /[А-Яа-яЁё]/.test(node.text) && !(node.text in sourceMap)) {
      report(node, `Russian text is absent from the catalog: ${JSON.stringify(node.text)}`)
    }
    if (
      ts.isTemplateExpression(node) &&
      /[А-Яа-яЁё]/.test([node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(''))
    ) {
      report(node, 'Dynamic Russian template must use an i18n key with interpolation')
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      const argument = node.arguments[0]
      if (
        argument &&
        ts.isStringLiteralLike(argument) &&
        /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/.test(argument.text) &&
        !(argument.text in ru)
      ) {
        report(argument, `Unknown i18n key: ${argument.text}`)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`i18n catalog OK: ${Object.keys(ru).length} synchronized translations.`)
