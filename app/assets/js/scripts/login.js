/**
 * Script for login.ejs
 */
// Validation Regexes.
const validUsername = /^[a-zA-Z0-9_]{1,16}$/
const basicEmail = /^\S+@\S+\.\S+$/

// Login Elements
const loginCancelContainer = document.getElementById('loginCancelContainer')
const loginCancelButton = document.getElementById('loginCancelButton')
const loginForm = document.getElementById('loginForm')
const loginMSButton = document.getElementById('loginMSButton')

// Control variables.
let lu = false,
    lp = false

const loggerLogin = LoggerUtil('%c[Login]', 'color: #000668; font-weight: bold')

let loginViewOnSuccess = VIEWS.landing
let loginViewOnCancel = VIEWS.settings
let loginViewCancelHandler

function loginCancelEnabled(val) {
    if (val) {
        $(loginCancelContainer).show()
    } else {
        $(loginCancelContainer).hide()
    }
}

loginCancelButton.onclick = (e) => {
        switchView(getCurrentView(), loginViewOnCancel, 500, 500, () => {
            loginCancelEnabled(false)
            if (loginViewCancelHandler != null) {
                loginViewCancelHandler()
                loginViewCancelHandler = null
            }
        })
    }
    // Disable default form behavior.
loginForm.onsubmit = () => { return false }

loginMSButton.addEventListener('click', (event) => {
    // Show loading stuff.
    console.log('loginMSButton.addEventListener')
    toggleOverlay(true, false, 'msOverlay')
    loginMSButton.disabled = true
    ipcRenderer.send('openMSALoginWindow', 'open')
})

ipcRenderer.on('MSALoginWindowReply', (event, ...args) => {
    if (args[0] === 'error') {

        loginMSButton.disabled = false
        switch (args[1]) {
            case 'AlreadyOpenException':
                {
                    setOverlayContent('ERROR', 'すでにログインウィンドウが開いています！', 'OK')
                    setOverlayHandler(() => {
                        toggleOverlay(false)
                        toggleOverlay(false, false, 'msOverlay')
                    })
                    toggleOverlay(true)
                    return
                }
            case 'AuthNotFinished':
                {
                    setOverlayContent('ERROR', 'NumaLauncherを使用するには、ログインが必要です。ログインに成功すると、ウィンドウは自動的に閉じます。', 'OK')
                    setOverlayHandler(() => {
                        toggleOverlay(false)
                        toggleOverlay(false, false, 'msOverlay')
                    })
                    toggleOverlay(true)
                    return
                }
        }

    }
    toggleOverlay(false, false, 'msOverlay')
    const queryMap = args[0]
    if (queryMap.has('error')) {
        let error = queryMap.get('error')
        let errorDesc = queryMap.get('error_description')
        if (error === 'access_denied') {
            error = 'ERRPR'
            errorDesc = 'To use the Helios Launcher, you must agree to the required permissions! Otherwise you can\'t use this launcher with Microsoft accounts.<br><br>Despite agreeing to the permissions you don\'t give us the possibility to do anything with your account, because all data will always be sent back to you (the launcher) IMMEDIATELY and WITHOUT WAY.'
        }
        setOverlayContent(error, errorDesc, 'OK')
        setOverlayHandler(() => {
            loginMSButton.disabled = false
            toggleOverlay(false)
        })
        toggleOverlay(true)
        return
    }

    const authCode = queryMap.get('code')
    AuthManager.addMSAccount(authCode).then(account => {
        updateSelectedAccount(account)
        $('.circle-loader').toggleClass('load-complete')
        $('.checkmark').toggle()
        setTimeout(() => {
            switchView(VIEWS.login, loginViewOnSuccess, 500, 500, () => {
                // Temporary workaround
                if (loginViewOnSuccess === VIEWS.settings) {
                    prepareSettings()
                }
                loginViewOnSuccess = VIEWS.landing // Reset this for good measure.
                loginCancelEnabled(false) // Reset this for good measure.
                loginViewCancelHandler = null // Reset this for good measure.
                $('.circle-loader').toggleClass('load-complete')
                $('.checkmark').toggle()
                toggleOverlay(false)
            })
        }, 1000)
    }).catch(error => {
        loginMSButton.disabled = false
        setOverlayContent('ERROR', error.message ? error.message : 'Microsoftでのログイン中にエラーが発生しました！詳細については、ログを確認してください。 CTRL + SHIFT + Iで開くことができます。', Lang.queryJS('login.tryAgain'))
        setOverlayHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true)
        loggerLogin.error(error)
    })

})