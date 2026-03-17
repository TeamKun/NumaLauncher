/**
 * Cross-platform Electron launcher.
 * Clears ELECTRON_RUN_AS_NODE so that Electron runs as a proper
 * Electron process even when spawned from VS Code's terminal.
 *
 * Usage:  node scripts/launch.js [extra electron args...]
 *   e.g.  node scripts/launch.js --dev
 *         node scripts/launch.js --smoke-test --server local-1.20.4
 */
const { spawn } = require('child_process')
const electron = require('electron')

const args = ['.', ...process.argv.slice(2)]

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, args, {
    stdio: 'inherit',
    env
})

child.on('close', (code) => process.exit(code ?? 0))
