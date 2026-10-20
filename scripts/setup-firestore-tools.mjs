// Installs the one thing `npm run test:rules` needs and Node cannot supply:
// a Java runtime for the Firestore emulator.
//
//   npm run setup:test-tools
//
// Downloads a Temurin JRE 21 for the current OS/arch into .tools/jre (git-
// ignored, ~50 MB) and extracts it with the system `tar` — present on Linux,
// macOS and Windows 10+ (libarchive's bsdtar, which also reads the ZIP that
// Adoptium serves for Windows; PowerShell Expand-Archive is the fallback).
// Re-running is cheap: an existing install is reused.
//
// The emulator itself is NOT installed here — `test:rules` runs it through
// `npx firebase-tools`, so nothing is added to the project's dependencies.
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const TOOLS_DIR = path.join(ROOT, '.tools')
const JRE_DIR = path.join(TOOLS_DIR, 'jre')

const OS = { linux: 'linux', darwin: 'mac', win32: 'windows' }[process.platform]
const ARCH = { x64: 'x64', arm64: 'aarch64' }[process.arch]
const EXE = process.platform === 'win32' ? 'java.exe' : 'java'

if (!OS || !ARCH) {
  console.error(
    `Unsupported platform: ${process.platform}/${process.arch}. Install Java 17+ manually and re-run.`,
  )
  process.exit(1)
}

/** Finds java inside an extracted Temurin directory (jdk-21…/bin/java). */
function findJava(dir) {
  if (!existsSync(dir)) return null
  const candidate = path.join(dir, 'bin', EXE)
  if (existsSync(candidate)) return candidate
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const nested = findJava(path.join(dir, entry.name))
    if (nested) return nested
  }
  return null
}

if (findJava(JRE_DIR)) {
  console.log(`Java is already installed: ${findJava(JRE_DIR)}`)
  process.exit(0)
}

const IS_WIN = process.platform === 'win32'
const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${OS}/${ARCH}/jre/hotspot/normal/eclipse`
// Adoptium serves a ZIP for Windows and a .tar.gz elsewhere; the endpoint
// above negotiates the format from the OS in the path.
const archiveName = IS_WIN ? 'jre.zip' : 'jre.tar.gz'
const archive = path.join(TOOLS_DIR, archiveName)
const jreName = 'jre'

// Extraction runs with cwd=.tools and plain relative names: GNU tar (Git Bash)
// reads an absolute `C:\...` argument as a remote host — "Cannot connect to
// C: resolve failed" — and relative names sidestep that on every tar flavour.
function extract() {
  const args = ['-xf', archiveName, '-C', jreName, '--strip-components=1']
  const options = { cwd: TOOLS_DIR, stdio: 'inherit' }

  if (!IS_WIN) return spawnSync('tar', args, options)

  // Prefer the bundled bsdtar: it reads ZIP and keeps --strip-components,
  // so .tools/jre ends up with bin/java.exe directly.
  const systemTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  if (existsSync(systemTar)) return spawnSync(systemTar, args, options)

  // No System32 tar (pre-1803 Windows): Expand-Archive leaves the nested
  // jdk-21… directory in place, which findJava() already recurses into.
  return spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${JRE_DIR}' -Force`,
    ],
    { stdio: 'inherit' },
  )
}

mkdirSync(TOOLS_DIR, { recursive: true })
console.log(`Downloading a Java 21 runtime for ${process.platform}/${process.arch}…`)
console.log(`  ${url}`)

const response = await fetch(url)
if (!response.ok || !response.body) {
  console.error(`Download failed: HTTP ${response.status}. Install Java 17+ manually.`)
  process.exit(1)
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(archive))

console.log('Extracting…')
rmSync(JRE_DIR, { recursive: true, force: true })
mkdirSync(JRE_DIR, { recursive: true })
const tar = extract()
rmSync(archive, { force: true })

if (tar.status !== 0) {
  console.error('Could not extract the archive. Install Java 17+ manually and re-run.')
  process.exit(1)
}

const java = findJava(JRE_DIR)
if (!java) {
  console.error('Extraction finished but no java binary was found.')
  process.exit(1)
}

console.log(`Java installed: ${java}`)
console.log('Next: npm run test:rules')
