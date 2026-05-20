// Remove ELECTRON_RUN_AS_NODE set by VS Code's integrated terminal.
// Electron treats even an empty value as enabled, so we must delete it entirely.
delete process.env.ELECTRON_RUN_AS_NODE
const { spawn } = require('child_process')
const electron = require('electron')
const child = spawn(electron, ['.'], { stdio: 'inherit' })
child.on('close', (code) => process.exit(code))
