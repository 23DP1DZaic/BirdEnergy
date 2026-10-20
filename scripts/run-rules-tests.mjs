// Runs the Firestore rules tests against the emulator, on any OS.
//
//   npm run test:rules
//
// The emulator is a Java app, so this wrapper finds a JRE — the project-local
// one installed by `npm run setup:test-tools` first, then JAVA_HOME, then
// `java` on PATH — and puts it in front of PATH for firebase-tools. The
// emulator itself comes from `npx firebase-tools`, keeping it out of
// package.json. The child's exit status is passed through unchanged, so a
// failing rules test fails the command.
import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const EXE = process.platform === 'win32' ? 'java.exe' : 'java'

/** Java binary inside .tools/jre (Temurin keeps a nested jdk-…/bin/java). */
function findJava(dir) {
  const direct = path.join(dir, 'bin', EXE)
  if (existsSync(direct)) return direct
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = findJava(path.join(dir, entry.name))
    if (nested) return nested
  }
  return null
}

const localJava = findJava(path.join(ROOT, '.tools', 'jre'))
const javaBinary = localJava ?? (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', EXE) : null)

if (javaBinary && !existsSync(javaBinary)) {
  console.error(`JAVA_HOME points at ${javaBinary}, which does not exist.`)
  process.exit(1)
}

const env = { ...process.env }
if (javaBinary) {
  env.JAVA_HOME = path.dirname(path.dirname(javaBinary))
  env.PATH = `${path.dirname(javaBinary)}${path.delimiter}${env.PATH ?? ''}`
} else if (spawnSync('java', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    'The Firestore emulator needs Java 17+.\n' +
      '  Run: npm run setup:test-tools   (downloads one into .tools/jre)\n' +
      '  …or install Java and set JAVA_HOME.',
  )
  process.exit(1)
}

// `emulators:exec` takes the test command as one positional argument. Windows
// needs a shell to launch `npx.cmd`, but a shell re-splits the argument list —
// so the command is quoted explicitly there; otherwise firebase-tools' own
// option parser swallows `--test` and dies with "unknown option '--test'".
const isWindows = process.platform === 'win32'
const testCommand = 'node --test test/firestore.rules.test.ts'

const child = spawnSync(
  'npx',
  [
    '--yes',
    'firebase-tools',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'birdenergy-f1405',
    isWindows ? `"${testCommand}"` : testCommand,
  ],
  { cwd: ROOT, env, stdio: 'inherit', shell: isWindows },
)

process.exit(child.status ?? 1)
