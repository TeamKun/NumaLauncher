/**
 * Script for landing.ejs
 */
// Requirements
const cp = require('child_process')
const crypto = require('crypto')
const request = require('request')
const fs = require('fs')
const { URL } = require('url')

// Internal Requirements
const DiscordWrapper = require('./assets/js/discordwrapper')
const Mojang = require('./assets/js/mojang')
const ProcessBuilder = require('./assets/js/processbuilder')
const ServerStatus = require('./assets/js/serverstatus')
const Util = require('./assets/js/util')

// Launch Elements
const launch_content = document.getElementById('launch_content')
const launch_details = document.getElementById('launch_details')
const launch_progress = document.getElementById('launch_progress')
const launch_progress_label = document.getElementById('launch_progress_label')
const launch_details_text = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const server_selection_button_status = document.getElementById('server_selection_button_status')
const user_text = document.getElementById('user_text')

const loggerLanding = LoggerUtil('%c[Landing]', 'color: #000668; font-weight: bold')
    /* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading) {
    if (loading) {
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details) {
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = ((value / max) * 100)) {
    launch_progress.setAttribute('max', max)
    launch_progress.setAttribute('value', value)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total download size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setDownloadPercentage(value, max, percent = ((value / max) * 100)) {
    remote.getCurrentWindow().setProgressBar(value / max)
    setLaunchPercentage(value, max, percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val) {
    document.getElementById('launch_button').disabled = !val
}

// ゲーム起動ボタン押下
document.getElementById('launch_button').addEventListener('click', function(e) {
    loggerLanding.log('Launching game..')

    // OS,　プロセッサ, MCverionから起動できるか判定
    let validationResult = Util.varidatePlatform()
    if (validationResult) {
        showLaunchFailure(validationResult.title, validationResult.disc)
        return
    }

    const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
    const jExe = JavaGuard.javaExecFromRoot(Util.getJDKPath())
    if(!fs.existsSync(jExe)){
        asyncSystemScan(mcVersion)
    } else {

        setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
        toggleLaunchArea(true)
        setLaunchPercentage(0, 100)

        const jg = new JavaGuard(mcVersion)
        jg._validateJavaBinary(jExe).then((v) => {
            loggerLanding.log('Java version meta', v)
            if(v.valid){
                dlAsync()
            } else {
                asyncSystemScan(mcVersion)
            }
        })
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser) {
    let username = 'No Account Selected'
    if (authUser != null) {
        if (authUser.displayName != null) {
            username = authUser.displayName
        }
        if (authUser.uuid != null) {
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://crafatar.com/renders/body/${authUser.uuid}?overlay')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv) {
    if (getCurrentView() === VIEWS.settings) {
        saveAllModConfigurations()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.getID() : null)
    ConfigManager.save()
    server_selection_button_status.innerHTML = '\u2022 ' + (serv != null ? Util.removeOrderNumber(serv.getName()) : 'Modパックが選択されていません')
    if (getCurrentView() === VIEWS.settings) {
        animateModsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button_status.innerHTML = '\u2022 ロード中..'
server_selection_button.onclick = (e) => {
    e.target.blur()
    toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function() {
    loggerLanding.log('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    try {
        const statuses = await Mojang.status()
        greenCount = 0
        greyCount = 0

        for (let i = 0; i < statuses.length; i++) {
            const service = statuses[i]

            // Mojang API is broken for sessionserver. https://bugs.mojang.com/browse/WEB-2303
            if (service.service === 'sessionserver.mojang.com') {
                service.status = 'green'
            }

            if (service.essential) {
                tooltipEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            } else {
                tooltipNonEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            }

            if (service.status === 'yellow' && status !== 'red') {
                status = 'yellow'
            } else if (service.status === 'red') {
                status = 'red'
            } else {
                if (service.status === 'grey') {
                    ++greyCount
                }
                ++greenCount
            }

        }

        if (greenCount === statuses.length) {
            if (greyCount === statuses.length) {
                status = 'grey'
            } else {
                status = 'green'
            }
        }

    } catch (err) {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        loggerLanding.debug(err)
    }

    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = Mojang.statusToHex(status)
}

const refreshServerStatus = async function(fade = false) {
    loggerLanding.log('Refreshing Server Status')
    const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())

    let pLabel = 'SERVER'
    let pVal = 'OFFLINE'

    try {
        const serverURL = new URL('my://' + serv.getAddress())
        const servStat = await ServerStatus.getStatus(serverURL.hostname, serverURL.port)
        if (servStat.online) {
            pLabel = 'プレイヤー'
            pVal = servStat.onlinePlayers + '/' + servStat.maxPlayers
        }

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if (fade) {
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }

}

refreshMojangStatuses()
    // Server Status is refreshed in uibinder.js on distributionIndexDone.

// Set refresh rate to once every 5 minutes.
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 300000)
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc) {
    setOverlayContent(
        title,
        desc,
        '了解'
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

let sysAEx
let scanAt

let extractListener

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {string} mcVersion The Minecraft version we are scanning for.
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
function asyncSystemScan(mcVersion, launchAfter = true) {

    setLaunchDetails('しばらくお待ち下さい..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)
    const loggerSysAEx = LoggerUtil('%c[SysAEx]', 'color: #353232; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Fork a process to run validations.
    sysAEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
            'JavaGuard',
            mcVersion
        ], {
            env: forkEnv,
            stdio: 'pipe'
        })
        // Stdout
    sysAEx.stdio[1].setEncoding('utf8')
    sysAEx.stdio[1].on('data', (data) => {
            loggerSysAEx.log(data)
        })
        // Stderr
    sysAEx.stdio[2].setEncoding('utf8')
    sysAEx.stdio[2].on('data', (data) => {
        loggerSysAEx.log(data)
    })

    sysAEx.on('message', (m) => {

        if (m.context === 'validateJava') {
            if (m.result == null) {
                // If the result is null, no valid Java installation was found.
                // Show this information to the user.
                setOverlayContent(
                    '対応したJava<br>がインストールされていません',
                    '参加するためには64ビット版Javaのインストールが必要です。インストールしますか?インストールには<a href="http://www.oracle.com/technetwork/java/javase/terms/license/index.html">Oracleライセンス条項</a>に同意する必要があります。',
                    'Javaをインストール',
                    '手動でインストール'
                )
                setOverlayHandler(() => {
                    setLaunchDetails('Javaダウンロードの準備中..')
                    sysAEx.send({ task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(), JavaGuard.javaExecFromRoot(Util.getJDKPath()), Util.getJDKPath(), Util.getJDKVersion()] })
                    sysAEx.send({ task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()] })
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    $('#overlayContent').fadeOut(250, () => {
                        //$('#overlayDismiss').toggle(false)
                        setOverlayContent(
                            '起動には<br>Javaが必要です',
                            '起動には64ビット版Javaのインストールが必要です。<br><br>手動インストールは <a href="https://github.com/dscalzi/HeliosLauncher/wiki/Java-Management#manually-installing-a-valid-version-of-java">Java Management Guide (英語)</a> を参考にしてください。',
                            '分かりました',
                            '戻る'
                        )
                        setOverlayHandler(() => {
                            toggleLaunchArea(false)
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false, true)
                            asyncSystemScan()
                        })
                        $('#overlayContent').fadeIn(250)
                    })
                })
                toggleOverlay(true, true)

            } else {
                // Java installation found, use this to launch the game.
                ConfigManager.setJavaExecutable(m.result)
                ConfigManager.save()

                // We need to make sure that the updated value is on the settings UI.
                // Just incase the settings UI is already open.
                settingsJavaExecVal.value = m.result
                populateJavaExecDetails(settingsJavaExecVal.value)

                if (launchAfter) {
                    dlAsync()
                }
                sysAEx.disconnect()
            }
        } else if (m.context === '_enqueueOpenJDK') {

            const [result, message] = m.result
            if (result === true) {

                // Oracle JRE enqueued successfully, begin download.
                setLaunchDetails('Javaをダウンロード中..')
                sysAEx.send({
                    task: 'execute',
                    function: 'processDlQueues',
                    argsArr: [
                        [{ id: 'java', limit: 1 }]
                    ]
                })

            } else {

                // Oracle JRE enqueue failed. Probably due to a change in their website format.
                // User will have to follow the guide to install Java.
                setOverlayContent(
                    '問題発生:<br>Javaのダウンロードに失敗した',
                    message ? message : '不幸なことにJavaのインストールに失敗してしまいました。手動でインストールする必要があります。手動インストールは <a href="https://github.com/dscalzi/HeliosLauncher/wiki">Troubleshooting Guide (英語)</a> を参考にしてください。',
                    'わかりました'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    toggleLaunchArea(false)
                })
                toggleOverlay(true)
                sysAEx.disconnect()

            }

        } else if (m.context === 'progress') {

            switch (m.data) {
                case 'download':
                    // Downloading..
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
            }

        } else if (m.context === 'complete') {

            switch (m.data) {
                case 'download':
                    {
                        // Show installing progress bar.
                        remote.getCurrentWindow().setProgressBar(2)

                        // Wait for extration to complete.
                        const eLStr = '展開中'
                        let dotStr = ''
                        setLaunchDetails(eLStr)
                        extractListener = setInterval(() => {
                            if (dotStr.length >= 3) {
                                dotStr = ''
                            } else {
                                dotStr += '.'
                            }
                            setLaunchDetails(eLStr + dotStr)
                        }, 750)
                        break
                    }
                case 'java':
                    // Download & extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)

                    // Extraction completed successfully.
                    ConfigManager.setJavaExecutable(m.args[0])
                    ConfigManager.save()

                    if (extractListener != null) {
                        clearInterval(extractListener)
                        extractListener = null
                    }

                    setLaunchDetails('Javaのインストール完了!')

                    if (launchAfter) {
                        dlAsync()
                    }

                    sysAEx.disconnect()
                    break
            }

        } else if (m.context === 'error') {
            console.log(m.error)
        }
    })

    // // Begin system Java scan.
    // setLaunchDetails('システムをスキャン中..')
    // sysAEx.send({ task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getDataDirectory()] })

    // バグの原因なのでシステム環境依存のJavaは使用しない。
    // 代わりにJavaダウンロードを開始する。
    setLaunchDetails('Javaダウンロードの準備中..')
    sysAEx.send({ task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(), JavaGuard.javaExecFromRoot(Util.getJDKPath()), Util.getJDKPath(), Util.getJDKVersion()] })
    sysAEx.send({ task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()] })
}

// Keep reference to Minecraft Process
let proc
    // Is DiscordRPC enabled
let hasRPC = false
    // Joined server regex
    // Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/
const MIN_LINGER = 5000

let aEx
let serv
let versionData
let forgeData

let progressListener

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if (login) {
        if (ConfigManager.getSelectedAccount() == null) {
            loggerLanding.error('You must be logged into an account.')
            toggleLaunchArea(false)
            return
        }

        if (!await validateSelectedAccount()) {
            loggerLanding.error('Login failed.')
            toggleLaunchArea(false)
            return
        }
    }

    setLaunchDetails('Please wait..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerAEx = LoggerUtil('%c[AEx]', 'color: #353232; font-weight: bold')
    const loggerLaunchSuite = LoggerUtil('%c[LaunchSuite]', 'color: #000668; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Start AssetExec to run validations and downloads in a forked process.
    aEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
            'AssetGuard',
            ConfigManager.getCommonDirectory(),
            JavaGuard.javaExecFromRoot(Util.getJDKPath()),
            Util.getJDKPath(),
            Util.getJDKVersion(),
        ], {
            env: forkEnv,
            stdio: 'pipe'
        })
        // Stdout
    aEx.stdio[1].setEncoding('utf8')
    aEx.stdio[1].on('data', (data) => {
            loggerAEx.log(data)
        })
        // Stderr
    aEx.stdio[2].setEncoding('utf8')
    aEx.stdio[2].on('data', (data) => {
        loggerAEx.log(data)
    })
    aEx.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure('起動中に問題が発生しました', err.message || '(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。')
    })
    aEx.on('close', (code, signal) => {
        if (code !== 0) {
            loggerLaunchSuite.error(`AssetExec exited with code ${code}, assuming error.`)
            showLaunchFailure('起動中に問題が発生しました', '(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。')
        }
    })

    // Establish communications between the AssetExec and current process.
    aEx.on('message', (m) => {

        if (m.context === 'validate') {
            switch (m.data) {
                case 'distribution':
                    setLaunchPercentage(10, 100)
                    loggerLaunchSuite.log('Validated distibution index.')
                    setLaunchDetails('バージョン情報を読込中..')
                    break
                case 'version':
                    setLaunchPercentage(30, 100)
                    loggerLaunchSuite.log('Version data loaded.')
                    setLaunchDetails('アセットを検証中..')
                    break
                case 'assets':
                    setLaunchPercentage(50, 100)
                    loggerLaunchSuite.log('Asset Validation Complete')
                    setLaunchDetails('ライブラリを検証中..')
                    break
                case 'libraries':
                    setLaunchPercentage(70, 100)
                    loggerLaunchSuite.log('Library validation complete.')
                    setLaunchDetails('ファイルを検証中..')
                    break
                case 'files':
                    setLaunchPercentage(80, 100)
                    loggerLaunchSuite.log('File validation complete.')
                    setLaunchDetails('ファイルをダウンロード中..')
                    break
                case 'install':
                    setLaunchPercentage(100, 100)
                    loggerLaunchSuite.log('Forge validation complete.')
                    setLaunchDetails('Forgeをインストール中..')
                    break
            }
        } else if (m.context === 'progress') {
            switch (m.data) {
                case 'assets':
                    {
                        const perc = (m.value / m.total) * 20
                        setLaunchPercentage(40 + perc, 100, parseInt(40 + perc))
                        break
                    }
                case 'download':
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
                case 'extract':
                    {
                        // Show installing progress bar.
                        remote.getCurrentWindow().setProgressBar(2)

                        // Download done, extracting.
                        const eLStr = 'ライブラリを展開中'
                        let dotStr = ''
                        setLaunchDetails(eLStr)
                        progressListener = setInterval(() => {
                            if (dotStr.length >= 3) {
                                dotStr = ''
                            } else {
                                dotStr += '.'
                            }
                            setLaunchDetails(eLStr + dotStr)
                        }, 750)
                        break
                    }
            }
        } else if (m.context === 'complete') {
            switch (m.data) {
                case 'download':
                case 'install':
                    // Download and extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)
                    if (progressListener != null) {
                        clearInterval(progressListener)
                        progressListener = null
                    }

                    setLaunchDetails('起動の準備中..')
                    break
            }
        } else if (m.context === 'error') {
            switch (m.data) {
                case 'download':
                    loggerLaunchSuite.error('Error while downloading:', m.error)

                    if (m.error.code === 'ENOENT') {
                        showLaunchFailure(
                            'ダウンロードエラー',
                            'ファイルサーバーに接続できません。インターネットに繋がれているか確認し、もう一度お試しください。'
                        )
                    } else {
                        showLaunchFailure(
                            'ダウンロードエラー',
                            '(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。もう一度お試しください。'
                        )
                    }

                    remote.getCurrentWindow().setProgressBar(-1)

                    // Disconnect from AssetExec
                    aEx.disconnect()
                    break
            }
        } else if (m.context === 'validateEverything') {

            let allGood = true

            setLaunchPercentage(100, 100)

            // If these properties are not defined it's likely an error.
            if (m.result.forgeData == null || m.result.versionData == null) {
                if (m.result.manualData !== undefined) {
                    loggerLaunchSuite.info('Manual mode:', m.result)

                    loggerLaunchSuite.info('Manual Installation', m.result.manualData)
                    showLaunchFailure('手動でのインストールが必要です', '開かれたウィンドウのMODをすべてダウンロードし、再度PLAYボタンを押してください。')

                    ipcRenderer.send('openManualWindow', m.result)
                } else {
                    loggerLaunchSuite.error('Error during validation:', m.result)

                    loggerLaunchSuite.error('Error during launch', m.result.error)
                    showLaunchFailure('起動中に問題が発生しました', '(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。')
                }
                allGood = false
            }

            forgeData = m.result.forgeData
            versionData = m.result.versionData

            if (login && allGood) {
                const authUser = ConfigManager.getSelectedAccount()
                loggerLaunchSuite.log(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
                let pb = new ProcessBuilder(serv, versionData, forgeData, authUser, remote.app.getVersion())
                setLaunchDetails('Launching game..')

                // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
                const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

                const onLoadComplete = () => {
                    toggleLaunchArea(false)
                    if (hasRPC) {
                        DiscordWrapper.updateDetails('ゲームをロード中..')
                    }
                    proc.stdout.on('data', gameStateChange)
                    proc.stdout.removeListener('data', tempListener)
                    proc.stderr.removeListener('data', gameErrorListener)
                }
                const start = Date.now()

                // Attach a temporary listener to the client output.
                // Will wait for a certain bit of text meaning that
                // the client application has started, and we can hide
                // the progress bar stuff.
                const tempListener = function(data) {
                    if (GAME_LAUNCH_REGEX.test(data.trim())) {
                        const diff = Date.now() - start
                        if (diff < MIN_LINGER) {
                            setTimeout(onLoadComplete, MIN_LINGER - diff)
                        } else {
                            onLoadComplete()
                        }
                    }
                }

                // Listener for Discord RPC.
                const gameStateChange = function(data) {
                    data = data.trim()
                    if (SERVER_JOINED_REGEX.test(data)) {
                        DiscordWrapper.updateDetails('50人クラフトに参加中!')
                    } else if (GAME_JOINED_REGEX.test(data)) {
                        DiscordWrapper.updateDetails('マインクラフトをプレイ中!')
                    }
                }

                const gameErrorListener = function(data) {
                    data = data.trim()
                    if (data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1) {
                        loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                        showLaunchFailure('起動中に問題が発生しました', '重要なファイルであるLaunchWrapperのダウンロードに失敗したため、ゲームを起動できません。<br><br>このエラーを直すためには一旦、ウィルス対策ソフトを無効にして起動し直してみてください。')
                    }
                }

                try {
                    // Build Minecraft process.
                    proc = pb.build()



                    //options.txtを共通化する
                    const fs = require('fs')
                    const filenames = fs.readdirSync(ConfigManager.getInstanceDirectory())
                    const path = require('path')
                        //共通化のオプションがオンの時かつコピー先オプションファイルが存在しないときコピーを実行する
                    if (ConfigManager.getoptionStandardize() && !fs.existsSync(path.join(pb.gameDir, 'options.txt'))) {
                        //最新のoptions.txtを取得する
                        let maxMtime = null
                        let optionfilepath = ''
                        filenames.forEach((filename) => {

                            const optionPath = path.join(ConfigManager.getInstanceDirectory(), filename, 'options.txt')

                            if (fs.existsSync(optionPath)) {
                                const stats = fs.statSync(optionPath)
                                if (maxMtime == null || stats.mtime > maxMtime) {
                                    maxMtime = stats.mtime
                                    optionfilepath = optionPath
                                }
                            }

                        })

                        //コピー元ファイルが存在するときコピーを実行する
                        if (maxMtime != null) {
                            console.log('options.txtコピー実行 コピー元:' + optionfilepath)
                            const copy = require('./assets/js/optionscopy')
                            copy.copy(optionfilepath, path.join(pb.gameDir, 'options.txt'))
                        }
                    }




                    // Bind listeners to stdout.
                    proc.stdout.on('data', tempListener)
                    proc.stderr.on('data', gameErrorListener)

                    // 一定時間経ったらLoading表示を解除
                    setTimeout(() => { toggleLaunchArea(false) }, 10000)

                    setLaunchDetails('準備OK。参加勢集合！！！')

                    // Init Discord Hook
                    const distro = DistroManager.getDistribution()
                    if (distro.discord != null && serv.discord != null) {
                        DiscordWrapper.initRPC(distro.discord, serv.discord)
                        hasRPC = true
                        proc.on('close', (code, signal) => {
                            loggerLaunchSuite.log('Shutting down Discord Rich Presence..')
                            DiscordWrapper.shutdownRPC()
                            hasRPC = false
                            proc = null
                        })
                    }

                } catch (err) {

                    loggerLaunchSuite.error('Error during launch', err)
                    showLaunchFailure('起動中に問題が発生しました', '(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。')

                }
            }

            // Disconnect from AssetExec
            aEx.disconnect()

        }
    })

    // Begin Validations

    // Validate Forge files.
    setLaunchDetails('Modパックの情報をロード中..')

    refreshDistributionIndex(true, (data) => {
        onDistroRefresh(data)
        serv = data.getServer(ConfigManager.getSelectedServer())
        aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
    }, (err) => {
        loggerLaunchSuite.log('Error while fetching a fresh copy of the distribution index.', err)
        refreshDistributionIndex(false, (data) => {
            onDistroRefresh(data)
            serv = data.getServer(ConfigManager.getSelectedServer())
            aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
        }, (err) => {
            loggerLaunchSuite.error('Unable to refresh distribution index.', err)
            if (DistroManager.getDistribution() == null) {
                showLaunchFailure('致命的なエラー', '配布マニフェストの読み込みに失敗したため失敗しました。(CTRL + Shift + i) でコンソールを開けば何かがわかるかもしれません。')

                // Disconnect from AssetExec
                aEx.disconnect()
            } else {
                serv = data.getServer(ConfigManager.getSelectedServer())
                aEx.send({ task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()] })
            }
        })
    })
}

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 *
 * @param {boolean} up True to slide up, otherwise false.
 */
function slide_(up) {
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if (up) {
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
            //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
            //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if (newsGlideCount === 1) {
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if (newsActive) {
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

/**
 * Bind functionality to the file system button for the selected
 * server configuration.
 */
document.getElementById('settingsFileSystemButton').onclick = () => {
    const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
    const CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.getID())
    DropinModUtil.validateDir(CACHE_SETTINGS_MODS_DIR)
    shell.openPath(CACHE_SETTINGS_MODS_DIR)
}