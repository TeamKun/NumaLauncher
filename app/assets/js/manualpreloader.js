const {ipcRenderer} = require('electron')

// ロガー
const logger = require('./loggerutil')('%c[ManualPreloader]', 'color: #a02d2a; font-weight: bold')

logger.log('手動ダウンロード支援ページを初期化中...')

// 最初に一回案内を表示するフラグ
let isFirst = false
ipcRenderer.on('manual-first', (event, arg) => {
    isFirst = true
})

// 案内情報をメインプロセスから受け取る
ipcRenderer.on('manual-data', (event, artifact, manualWindowIndex) => {
    logger.log('案内情報を受信: ', artifact, manualWindowIndex)

    // jQueryを読み込み
    const jQuery = require('jquery')
    //window.jQuery = jQuery

    // アラート用のライブラリ
    const Swal = require('sweetalert2')

    // 荒らしにくくしたeval あくまでも気休め程度
    function scopeEval(scope, script) {
        return Function('"use strict";return (' + script + ')').bind(scope)()
    }

    // YouTube URLからIDを抽出
    function getYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
        const match = url.match(regExp)

        return (match && match[2].length === 11)
            ? match[2]
            : null
    }

    // YouTubeの案内を表示
    function openYouTube(url) {
        const id = getYouTubeId(url)
        Swal.fire({
            title: 'ダウンロードの手順',
            html: `<p>動画の手順に従ってダウンロードしてください</p><iframe width="450" height="256" src="https://www.youtube.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        })
    }

    // ダウンロード情報を管理 (複数同時にダウンロードされることはないだろうが、念の為対応)
    const manualDownloads = []
    ipcRenderer.on('download-start', (event, data) => {
        // リダイレクト阻止
        ipcRenderer.send('preventManualWindowRedirect', manualWindowIndex, true)
        // 進捗を表示。ただしSwalは同時に2つダイアログをだすことはできない
        Swal.fire({
            title: 'ダウンロード中',
            html: `${data.name}<p>${(data.received / 1024).toFixed()} / ${(data.total / 1024).toFixed()} KB</p>`,
            allowOutsideClick: false,
            showCancelButton: false,
            showConfirmButton: false,
        })
        manualDownloads[data.index] = {
            name: data.name,
            container: Swal.getHtmlContainer().querySelector('p'),
        }
    })
    ipcRenderer.on('download-progress', (event, data) => {
        logger.log(`${data.received.toFixed() / 1024} / ${(data.total / 1024).toFixed()} KB`)
        manualDownloads[data.index].container.innerText = `${(data.received / 1024).toFixed()} / ${(data.total / 1024).toFixed()} KB`
    })
    ipcRenderer.on('download-end', (event, data) => {
        if (data.state === 'completed') {
            // 正常終了
            Swal.fire({
                title: 'ダウンロード完了',
                text: 'お疲れさまでした',
                icon: 'success',
                confirmButtonText: 'ウィンドウを閉じる',
                allowOutsideClick: false,
            }).then(result => {
                // OK押したらウィンドウを閉じる
                ipcRenderer.send('closeManualWindow', manualWindowIndex)
            })
        } else if (data.state === 'hash-failed') {
            // ハッシュ値が違う場合
            Swal.fire({
                title: '違うファイルをダウンロードしています',
                text: '手順をもう一度確認してください',
                icon: 'error',
            }).then(result => {
                // リダイレクト阻止解除
                ipcRenderer.send('preventManualWindowRedirect', manualWindowIndex, false)
            })
        } else {
            // 失敗
            Swal.fire({
                title: 'ダウンロード失敗',
                text: 'しばらく時間を置いてもう一度お試しください',
                icon: 'error',
            }).then(result => {
                // リダイレクト阻止解除
                ipcRenderer.send('preventManualWindowRedirect', manualWindowIndex, false)
            })
        }
    })

    // CSS
    let hintCss = `
        .swal2-container {
            z-index: 1000001;
        }

        .manual-info-button {
            z-index: 1000000;
            padding: 7px;
            display: flex;
            color: black;
            font-family: 'Roboto', arial, helvetica, sans-serif;
            font-size: 14px;
            line-height: 20px;
            align-items: center;
            justify-content: center;
            background-color: white;
            border: 2px solid red;
            border-radius: 5px;
        }

        .manual-info-button:hover {
            background-color: yellow;
            cursor: pointer;
        }

        .manual-info-button-help {
            position: fixed;
            padding-left: 15px;
            bottom: 10px;
            right: 10px;
        }

        .manual-info-button-back {
            position: fixed;
            bottom: 10px;
            left: 10px;
        }

        .manual-info-hint {
            position: relative;
            padding-left: 35px !important;
        }

        .manual-info-hint:before {
            content: "";
            position: absolute;
            width: calc(100% - 4px);
            height: calc(100% - 4px);
            border: 4px solid red;
            top: -2px;
            left: -2px;
            pointer-events: none;
        }

        .manual-info-circle:after {
            content: "";
            position: absolute;
            bottom: -5px;
            left: -10px;
            width: 36px;
            height: 36px;
            background-color: white;
            line-height: 36px;
            font-family: 'Roboto', arial, helvetica, sans-serif;
            font-size: 30px;
            color: red;
            text-align: center;
            vertical-align: middle;
            border-radius: 36px;
            border: 2px solid red;
            pointer-events: none;
        }

        .manual-info-button-help:after {
            content: "?";
            top: -20px;
            left: -20px;
            pointer-events: inherit;
            background-color: inherit;
        }
    `

    // ヒントを表示
    if (artifact.manual.hints !== undefined) {
        const showHints = () => {
            artifact.manual.hints.forEach((hint, hintIndex) => {
                (
                    hint.script
                        ? scopeEval({jQuery}, hint.script)
                        : jQuery(hint.css)
                )
                    .addClass('manual-info-circle')
                    .addClass('manual-info-hint')
                    .addClass(`manual-info-hint-${hintIndex + 1}`)
            })
        }

        // 意地でもヒントを表示させる
        if (document.readyState === 'loading') {  // Loading hasn't finished yet
            document.addEventListener('DOMContentLoaded', showHints)
        } else {  // `DOMContentLoaded` has already fired
            showHints()
        }
        setInterval(showHints, 1000)

        // CSSを追加
        artifact.manual.hints.forEach((hint, hintIndex) => {
            hintCss += `        
                .manual-info-hint-${hintIndex + 1}.manual-info-circle:after {
                    content: "${hintIndex + 1}";
                }
            `
        })
    }

    // CSSを適用
    jQuery('<style>')
        .html(hintCss)
        .appendTo(jQuery('head'))

    // 戻る
    jQuery('<div>')
        .addClass('manual-info-button')
        .addClass('manual-info-button-back')
        .text('戻る')
        .appendTo(jQuery('body'))
        .on('click', () => {
            history.back()
        })

    // 案内を表示
    if (artifact.manual.video !== undefined) {
        jQuery('<div>')
            .addClass('manual-info-button-help')
            .addClass('manual-info-button')
            .addClass('manual-info-circle')
            .text('もう一度やり方を見る')
            .appendTo(jQuery('body'))
            .on('click', () => {
                openYouTube(artifact.manual.video)
            })

        if (isFirst) {
            openYouTube(artifact.manual.video)
        }
    }
})