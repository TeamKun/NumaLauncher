const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const semver                            = require('semver')
const { pathToFileURL }                 = require('url')
const { AZURE_CLIENT_ID, MC_LAUNCHER_CLIENT_ID, MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')
const { default: got }                  = require('got')
const fs                                = require('fs')
const fsExtra                           = require('fs-extra')
const crypto                            = require('crypto')

app.setAsDefaultProtocolClient('numalauncher');

let deepLinkUrl = null;
let win
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
    app.on('second-instance', (event, argv, workingDirectory) => {
        const deeplinkArg = argv.find(arg => arg.startsWith('numalauncher://'));

        if (deeplinkArg) {
          if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();

            handleDeepLink(deeplinkArg);
          } else {
            deepLinkUrl = deeplinkArg;
          }
        }
      });
}

// URI起動mac用
app.on('open-url', (event, url) => {
  event.preventDefault();
  deepLinkUrl = url;
});

// URI起動win用
app.on('ready', () => {
    const args = process.argv;
    deepLinkUrl = args.find(arg => arg.startsWith('numalauncher://'));
});

// アプリ準備ができたら
app.whenReady().then(() => {
  // ページの読み込み完了後に処理
  win.webContents.once('did-finish-load', () => {
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
      deepLinkUrl = null;
    }
  });
});

function handleDeepLink(url) {
  const parsedUrl = new URL(url);
  const query = parsedUrl.searchParams.get("query");

  if (win && win.webContents) {
    win.webContents.send('setServerOption', query);
  }
}


// Setup Lang
LangLoader.setupLanguage()

// Setup auto updater.
function initAutoUpdater(event, data) {

    if(data){
        autoUpdater.allowPrerelease = true
    } else {
        // Defaults to true if application version contains prerelease components (e.g. 0.12.1-alpha.1)
        // autoUpdater.allowPrerelease = true
    }

    if(isDev){
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    autoUpdater.on('update-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
        event.sender.send('autoUpdateNotification', 'update-downloaded', info)
    })
    autoUpdater.on('update-not-available', (info) => {
        event.sender.send('autoUpdateNotification', 'update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        event.sender.send('autoUpdateNotification', 'checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        event.sender.send('autoUpdateNotification', 'realerror', err)
    })
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event, data)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    event.sender.send('autoUpdateNotification', 'realerror', err)
                })
            break
        case 'allowPrereleaseChange':
            if(!data){
                const preRelComp = semver.prerelease(app.getVersion())
                if(preRelComp != null && preRelComp.length > 0){
                    autoUpdater.allowPrerelease = true
                } else {
                    autoUpdater.allowPrerelease = data
                }
            } else {
                autoUpdater.allowPrerelease = data
            }
            break
        case 'installUpdateNow':
            autoUpdater.quitAndInstall()
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Redirect distribution index event from preloader to renderer.
ipcMain.on('distributionIndexDone', (event, res) => {
    event.sender.send('distributionIndexDone', res)
})

// 手動ダウンロード画面
! function() {
    // ウィンドウID管理
    let manualWindowIndex = 0
    let manualWindows = []
        // ダウンロードID管理
    let downloadIndex = 0
        // ダウンロードフォルダ
    const downloadDirectory = path.join(app.getPath('temp'), 'NumaLauncher', 'ManualDownloads')
        // IDでウィンドウを閉じる
    ipcMain.on('closeManualWindow', (ipcEvent, index) => {
            // IDを探してウィンドウを閉じる
            const window = manualWindows[index]
            if (window !== undefined) {
                window.win.close()
                manualWindows[index] = undefined
            }
        })
        // IDでウィンドウを閉じる
    ipcMain.on('preventManualWindowRedirect', (ipcEvent, index, prevent) => {
            // IDを探してリダイレクト可否フラグ変更
            const window = manualWindows[index]
            if (window !== undefined) {
                window.preventRedirect = prevent
            }
        })
        // 手動ダウンロード用のウィンドウを開く
    ipcMain.on('openManualWindow', (ipcEvent, result) => {
        // ハッシュチェック
        function validateLocal(filePath, algo, hash) {
            if (fs.existsSync(filePath)) {
                //No hash provided, have to assume it's good.
                if (hash == null) {
                    return true
                }
                let buf = fs.readFileSync(filePath)
                let calcdhash = crypto.createHash(algo).update(buf).digest('hex')
                return calcdhash === hash.toLowerCase()
            }
            return false
        }

        for (let manual of result.manualData) {
            const index = ++manualWindowIndex
            const win = new BrowserWindow({
                width: 1280,
                height: 720,
                icon: getPlatformIcon('SealCircle'),
                autoHideMenuBar: true,
                webPreferences: {
                    preload: path.join(__dirname, 'app', 'assets', 'js', 'manualpreloader.js'),
                    nodeIntegration: false,
                    contextIsolation: true, // TODO デバッグ後はtrue
                    enableRemoteModule: false,
                    worldSafeExecuteJavaScript: true,
                    partition: `manual-${index}`, // パーティションを分けることでウィンドウを超えてwill-downloadイベント同士が作用しあわない
                }
            })
            manualWindows[index] = {
                win,
                manual,
                preventRedirect: false,
            }
            // セキュリティポリシー無効化
            win.webContents.session.webRequest.onHeadersReceived((d, c) => {
                if (d.responseHeaders['Content-Security-Policy']) {
                    delete d.responseHeaders['Content-Security-Policy']
                } else if (d.responseHeaders['content-security-policy']) {
                    delete d.responseHeaders['content-security-policy']
                }

                c({ cancel: false, responseHeaders: d.responseHeaders })
            })

            // ウィンドウ開いた直後(ページ遷移時を除く)のみ最初のダイアログ表示
            win.webContents.send('manual-first')
                // ロードが終わったら案内情報のデータをレンダープロセスに送る
            win.webContents.on('dom-ready', (event, args) => {
                    if (win.isDestroyed())
                        return
                    win.webContents.send('manual-data', manual, index)
                })
                // リダイレクトキャンセル
            win.webContents.on('will-navigate', (event, args) => {
                    if (win.isDestroyed())
                        return
                    const window = manualWindows[index]
                    if (window !== undefined) {
                        if (window.preventRedirect)
                            event.preventDefault()
                    }
                })
                // ダウンロードされたらファイル名をすり替え、ハッシュチェックする
            win.webContents.session.on('will-download', (event, item, webContents) => {
                    if (win.isDestroyed())
                        return

                    downloadIndex++

                    // 一時フォルダに保存
                    item.setSavePath(path.join(downloadDirectory, item.getFilename()))

                    // 進捗を送信 (開始)
                    win.webContents.send('download-start', {
                            index: downloadIndex,
                            name: manual.manual.name,
                            received: item.getReceivedBytes(),
                            total: item.getTotalBytes(),
                        })
                        // 進捗を送信 (進行中)
                    item.on('updated', (event, state) => {
                            if (win.isDestroyed())
                                return
                            win.webContents.send('download-progress', {
                                index: downloadIndex,
                                name: manual.manual.name,
                                received: item.getReceivedBytes(),
                                total: item.getTotalBytes(),
                            })
                        })
                        // 進捗を送信 (完了)
                    item.once('done', (event, state) => {
                        if (win.isDestroyed())
                            return
                            // ファイルが正しいかチェックする
                        const v = item.getTotalBytes() === manual.size &&
                            validateLocal(item.getSavePath(), 'md5', manual.MD5)
                        if (!v) {
                            // 違うファイルをダウンロードしてしまった場合
                            win.webContents.send('download-end', {
                                index: downloadIndex,
                                name: manual.manual.name,
                                state: 'hash-failed',
                            })
                        } else if (fsExtra.existsSync(manual.path)) {
                            // ファイルが既にあったら閉じる
                            win.close()
                        } else {

                            // ファイルを正しい位置に移動
                            fsExtra.moveSync(item.getSavePath(), manual.path)
                                // 完了を通知
                            win.webContents.send('download-end', {
                                index: downloadIndex,
                                name: manual.manual.name,
                                state,
                            })
                        }
                    })
                })
                // ダウンロードサイトを表示
            win.loadURL(manual.manual.url)
        }
    })
    app.on('quit', () => {
        // tmpディレクトリお掃除
        fsExtra.removeSync(downloadDirectory)
    })
}()


// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

ipcMain.on('get-launcher-skin-path', (event) => {
    event.returnValue = app.getPath('appData');
});

ipcMain.on('get-home-path', (event) => {
    event.returnValue = app.getPath('home');
});


// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
app.disableHardwareAcceleration()


const REDIRECT_URI_PREFIX = 'https://login.microsoftonline.com/common/oauth2/nativeclient?'
const REDIRECT_URI_PREFIX_LIVE = 'https://login.live.com/oauth20_desktop.srf?'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
let msftAuthViewMsMcLauncherAuth
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose, msftAuthViewMsMcLauncherAuth)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthViewMsMcLauncherAuth = arguments_[2]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose, msftAuthViewMsMcLauncherAuth)
        }
    })

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        const query = uri.startsWith(REDIRECT_URI_PREFIX) ? uri.substring(REDIRECT_URI_PREFIX.length)
            : uri.startsWith(REDIRECT_URI_PREFIX_LIVE) ? uri.substring(REDIRECT_URI_PREFIX_LIVE.length)
                : undefined

        if (query) {
            let queries = query.split('#', 1).toString().split('&')
            let queryMap = {}

            queries.forEach(query => {
                const [name, value] = query.split('=')
                queryMap[name] = decodeURI(value)
            })

            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, msftAuthViewSuccess, msftAuthViewMsMcLauncherAuth)

            msftAuthSuccess = true
            msftAuthWindow.close()
            msftAuthWindow = null
        }
    })

    msftAuthWindow.removeMenu()
    if (msftAuthViewMsMcLauncherAuth) {
        msftAuthWindow.loadURL(`https://login.live.com/oauth20_authorize.srf?prompt=select_account&client_id=${MC_LAUNCHER_CLIENT_ID}&response_type=code&scope=service::user.auth.xboxlive.com::MBI_SSL&lw=1&fl=dob,easi2&xsup=1&nopa=2&redirect_uri=https://login.live.com/oauth20_desktop.srf`)
    } else {
        msftAuthWindow.loadURL(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`)
    }
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })

    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })

    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

async function createWindow() {

    win = new BrowserWindow({
        width: 980,
        height: 552,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    // 背景画像を取得
    const url = 'https://raw.githubusercontent.com/TeamKun/ModPacks/deploy/backgrounds'
    const backgrounds = await got.get(`${url}/list.json`, { responseType: 'json' })
        .then(res => res.body?.map(name => `${url}/${name}`))
        .catch(err => {
            console.error(err)
            return []
        })
    const background = backgrounds[Math.floor(Math.random() * backgrounds.length)] ?? ''

    const data = {
        bkid: background,
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders),
        appver: app.getVersion()
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {

    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    let ext
    switch(process.platform) {
        case 'win32':
            ext = 'ico'
            break
        case 'darwin':
        case 'linux':
        default:
            ext = 'png'
            break
    }

    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.${ext}`)
}

app.on('ready', createWindow)
app.on('ready', createMenu)

app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})
