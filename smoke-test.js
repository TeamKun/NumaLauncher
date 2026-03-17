/**
 * NumaLauncher MC Smoke Test Runner
 *
 * Usage:
 *   electron . --smoke-test                     # Test all MC versions (one server each)
 *   electron . --smoke-test --versions 1.20.1   # Specific version(s), comma-separated
 *   electron . --smoke-test --server local-1.20.4  # Specific server ID
 *   electron . --smoke-test --timeout 300       # Timeout per server in seconds (default: 180)
 *   electron . --smoke-test --no-download       # Skip downloads, validate only
 */

const { app } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const child_process = require('child_process')

// Shim @electron/remote for renderer-side modules (ConfigManager etc.)
// Must be set up before requiring any renderer modules.
const remoteShim = {
    app: app,
    process: process,
    getCurrentWindow: () => ({
        setProgressBar: () => {}
    })
}
const remotePath = require.resolve('@electron/remote')
require.cache[remotePath] = {
    id: remotePath,
    filename: remotePath,
    loaded: true,
    exports: remoteShim
}

// Now we can safely require renderer-side modules
const ConfigManager = require('./app/assets/js/configmanager')
const { DistroAPI } = require('./app/assets/js/distromanager')
const ProcessBuilder = require('./app/assets/js/processbuilder')
const AuthManager = require('./app/assets/js/authmanager')
const { LoggerUtil } = require('helios-core')
const { FullRepair } = require('helios-core/dl')
const { MojangIndexProcessor } = require('helios-core/dl')
const { DistributionIndexProcessor } = require('helios-core/dl')
const { discoverBestJvmInstallation, javaExecFromRoot, ensureJavaDirIsRoot } = require('helios-core/java')
const { join } = require('path')

const logger = LoggerUtil.getLogger('SmokeTest')

const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/

// Parse CLI arguments
function parseArgs() {
    const args = process.argv
    const opts = {
        versions: null,
        server: null,
        timeout: 180,
        noDownload: args.includes('--no-download')
    }

    const versionsIdx = args.indexOf('--versions')
    if (versionsIdx !== -1 && args[versionsIdx + 1]) {
        opts.versions = args[versionsIdx + 1].split(',')
    }

    const serverIdx = args.indexOf('--server')
    if (serverIdx !== -1 && args[serverIdx + 1]) {
        opts.server = args[serverIdx + 1]
    }

    const timeoutIdx = args.indexOf('--timeout')
    if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
        opts.timeout = parseInt(args[timeoutIdx + 1], 10)
    }

    return opts
}

// Select one server per MC version
function selectTestServers(distro, opts) {
    const servers = distro.servers

    if (opts.server) {
        const serv = servers.find(s => s.rawServer.id === opts.server)
        if (!serv) {
            logger.error(`Server "${opts.server}" not found.`)
            return []
        }
        return [serv]
    }

    const versionMap = new Map()
    for (const server of servers) {
        const mcVer = server.rawServer.minecraftVersion
        if (!versionMap.has(mcVer)) {
            versionMap.set(mcVer, server)
        }
    }

    let entries = [...versionMap.entries()]
    if (opts.versions) {
        entries = entries.filter(([ver]) => opts.versions.includes(ver))
    }

    // Sort by MC version
    entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    return entries.map(([, server]) => server)
}

// Kill a process tree (Windows needs taskkill)
function killProcess(child) {
    if (!child || child.killed) return
    if (process.platform === 'win32') {
        child_process.exec(`taskkill /pid ${child.pid} /T /F`, () => {})
    } else {
        child.kill('SIGTERM')
    }
}

// Validate and download files for a server
async function prepareServer(distro, serverId) {
    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        serverId,
        false
    )

    fullRepairModule.spawnReceiver()

    logger.info('Validating files...')
    const invalidCount = await fullRepairModule.verifyFiles(() => {})

    if (invalidCount > 0) {
        logger.info(`Found ${invalidCount} invalid files. Downloading...`)
        await fullRepairModule.download(() => {})
    } else {
        logger.info('All files valid.')
    }

    fullRepairModule.destroyReceiver()
    return invalidCount
}

// Install Forge and get version data
async function prepareForge(distro, serv) {
    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion
    )
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    // ForgeInstallerCLI.jar path (dev mode)
    const wrapperPath = join(process.cwd(), 'libraries', 'java', 'ForgeInstallerCLI.jar')

    let jExe = ConfigManager.getEffectiveJavaExecutable(serv.rawServer.id)
    if (!jExe) {
        // Auto-discover Java like the launcher GUI does
        logger.info('No Java configured, auto-discovering...')
        const jvmDetails = await discoverBestJvmInstallation(
            ConfigManager.getDataDirectory(),
            serv.effectiveJavaOptions.supported
        )
        if (!jvmDetails) {
            throw new Error(`No compatible Java found for server ${serv.rawServer.id} (requires ${serv.effectiveJavaOptions.supported}). Install Java first.`)
        }
        jExe = javaExecFromRoot(ensureJavaDirIsRoot(jvmDetails.path))
        ConfigManager.setRuntimeJavaExecutable(serv.rawServer.id, jExe)
        logger.info(`Discovered Java: ${jExe}`)
    }

    logger.info(`Installing Forge with Java: ${jExe}`)
    await distributionIndexProcessor.installForge(jExe, wrapperPath, () => {})

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    return { versionData, modLoaderData }
}

// Launch MC and wait for success regex or timeout
function launchAndWait(serv, versionData, modLoaderData, authUser, timeoutSec) {
    return new Promise((resolve) => {
        const pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, app.getVersion())
        const startTime = Date.now()
        let settled = false

        const child = pb.build()

        const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            killProcess(child)
            resolve({
                status: 'TIMEOUT',
                elapsed: (Date.now() - startTime) / 1000
            })
        }, timeoutSec * 1000)

        child.stdout.on('data', (data) => {
            if (settled) return
            const lines = data.toString().trim().split('\n')
            for (const line of lines) {
                if (GAME_LAUNCH_REGEX.test(line.trim())) {
                    settled = true
                    clearTimeout(timeout)
                    killProcess(child)
                    resolve({
                        status: 'PASS',
                        elapsed: (Date.now() - startTime) / 1000
                    })
                    return
                }
            }
        })

        child.on('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            resolve({
                status: 'CRASH',
                exitCode: code,
                elapsed: (Date.now() - startTime) / 1000
            })
        })

        child.on('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            resolve({
                status: 'ERROR',
                error: err.message,
                elapsed: (Date.now() - startTime) / 1000
            })
        })
    })
}

// Print results table
function printReport(results) {
    console.log('')
    console.log('=======================================')
    console.log(' NumaLauncher Smoke Test Report')
    console.log(` Date: ${new Date().toISOString()}`)
    console.log('=======================================')
    console.log('')
    console.log(' MC Version | Server                         | Status  | Time')
    console.log(' -----------|--------------------------------|---------|--------')

    let passCount = 0
    for (const r of results) {
        const ver = r.mcVersion.padEnd(9)
        const srv = r.serverId.padEnd(30)
        const status = r.status.padEnd(7)
        const time = `${r.elapsed.toFixed(1)}s`
        const color = r.status === 'PASS' ? '\x1b[32m' : '\x1b[31m'
        console.log(` ${ver}  | ${srv} | ${color}${status}\x1b[0m | ${time}`)
        if (r.status === 'PASS') passCount++
    }

    console.log('')
    console.log(` Result: ${passCount}/${results.length} PASSED`)
    console.log('=======================================')
    console.log('')

    return passCount === results.length ? 0 : 1
}

// Main entry point
async function run() {
    const opts = parseArgs()

    logger.info('NumaLauncher Smoke Test starting...')
    logger.info(`Options: timeout=${opts.timeout}s, noDownload=${opts.noDownload}`)

    // Load config
    ConfigManager.load()

    // Inject commonDir/instanceDir (normally done by preloader.js in renderer)
    DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
    DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

    // Validate auth token
    const account = ConfigManager.getSelectedAccount()
    if (!account) {
        logger.error('No account selected. Please log in via the launcher GUI first.')
        app.exit(1)
        return
    }

    logger.info(`Using account: ${account.displayName}`)
    try {
        await AuthManager.validateSelected()
        logger.info('Auth token validated.')
    } catch (err) {
        logger.error('Auth token validation failed. Please re-login via the launcher GUI.', err)
        app.exit(1)
        return
    }

    // Fetch distribution
    let distro
    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
    } catch (err) {
        logger.error('Failed to load distribution index.', err)
        app.exit(1)
        return
    }

    // Select test servers
    const testServers = selectTestServers(distro, opts)
    if (testServers.length === 0) {
        logger.error('No servers matched the specified criteria.')
        app.exit(1)
        return
    }

    logger.info(`Testing ${testServers.length} server(s):`)
    for (const s of testServers) {
        logger.info(`  - ${s.rawServer.id} (MC ${s.rawServer.minecraftVersion})`)
    }

    const results = []

    for (const serv of testServers) {
        const mcVer = serv.rawServer.minecraftVersion
        const serverId = serv.rawServer.id

        logger.info('')
        logger.info(`========== Testing: ${serverId} (MC ${mcVer}) ==========`)

        ConfigManager.setSelectedServer(serverId)

        try {
            // Step 1: Validate/Download
            if (!opts.noDownload) {
                await prepareServer(distro, serverId)
            } else {
                logger.info('Skipping download (--no-download)')
            }

            // Step 2: Forge install + version data
            const { versionData, modLoaderData } = await prepareForge(distro, serv)

            // Step 3: Launch and monitor
            const authUser = ConfigManager.getSelectedAccount()
            const result = await launchAndWait(serv, versionData, modLoaderData, authUser, opts.timeout)

            results.push({
                mcVersion: mcVer,
                serverId,
                ...result
            })

            logger.info(`Result: ${result.status} (${result.elapsed.toFixed(1)}s)`)

        } catch (err) {
            logger.error(`Error testing ${serverId}:`, err)
            results.push({
                mcVersion: mcVer,
                serverId,
                status: 'ERROR',
                error: err.message,
                elapsed: 0
            })
        }
    }

    // Print report
    const exitCode = printReport(results)
    app.exit(exitCode)
}

module.exports = { run }
