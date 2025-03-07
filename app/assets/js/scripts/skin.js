const skinFunc = require('./assets/js/scripts/skinfunc')
const skinOriginImg = require('./assets/js/scripts/skinoriginimg')

/*----------------------DOM操作関連----------------------*/

/*----------------------
ロード時の読み混み
----------------------*/

$(window).on('load', async function () {
    await skinFunc.getNowSkin()
    // スキン機能初回時にインポート・同期設定画面を開く
    if (!skinFunc.checkImportedSkinJSON()) {
        $('#settingSkinData').css('display', 'block')
    } else {
        await skinFunc.mergeNumaSkinJSON()
        $('#settingSkinData').css('display', 'none')
        await skinFunc.exportLibrary()
    }
})

/*----------------------
スキンを新しく追加する
----------------------*/

//スキン新規追加画面を開く
$('.selectSkin__addNew').on('click', function () {
    $('#addNewSkinContent').fadeIn()
    skinFunc.initAddSkinPreview()
})

// 新規追加して保存する(着替える)
$('.addSaveAndUse').on('click', async function () {
    $('.changeSkin__overlay').fadeIn()
    const name = $('input:text[name="skinAddName"]').val()
    const variant = $('input:radio[name="skinAddModel"]:checked').val()
    let slim = ''
    if (variant == 'slim') {
        slim = true
    } else {
        slim = false
    }
    const now = new Date()
    const created = now.toISOString()
    const file = $('#skinAddBox').prop('files')[0]
    const reader = new FileReader()
    reader.addEventListener(
        'load',
        async function () {
            const skinImage = reader.result
            const modelImage = await skinFunc.generateSkinModel(skinImage)
            await skinFunc.uploadSkin(variant, file)
            const textureID = await skinFunc.getTextureID()
            skinFunc.addSkinJSON(
                created,
                name,
                skinImage,
                modelImage,
                slim,
                textureID
            )
            $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
            await skinFunc.mergeNumaSkinJSON()
            await skinFunc.exportLibrary()
            $('#addNewSkinContent').fadeOut()
        },
        false
    )
    if (file) {
        reader.readAsDataURL(file)
    } else {
        if (slim) {
            skinImage = skinOriginImg.alexSkinImage
            modelImage = skinOriginImg.alexModelImage
        } else {
            skinImage = skinOriginImg.steveSkinImage
            modelImage = skinOriginImg.steveModelImage
        }
        await skinFunc.uploadSkin(variant, file)
        const textureID = await skinFunc.getTextureID()
        skinFunc.addSkinJSON(
            created,
            name,
            skinImage,
            modelImage,
            slim,
            textureID
        )
        $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
        await skinFunc.mergeNumaSkinJSON()
        await skinFunc.exportLibrary()
        $('#addNewSkinContent').fadeOut()
    }
    $('.changeSkin__overlay').fadeOut()
})

// 新規追加して保存する(着替えない)
$('.addSave').on('click', async function () {
    const name = $('input:text[name="skinAddName"]').val()
    const variant = $('input:radio[name="skinAddModel"]:checked').val()
    let slim = ''
    if (variant == 'slim') {
        slim = true
    } else {
        slim = false
    }
    const now = new Date()
    const created = now.toISOString()
    const file = $('#skinAddBox').prop('files')[0]
    const reader = new FileReader()
    reader.addEventListener(
        'load',
        async function () {
            const skinImage = reader.result
            const modelImage = await skinFunc.generateSkinModel(skinImage)
            skinFunc.addSkinJSON(
                created,
                name,
                skinImage,
                modelImage,
                slim,
                null
            )
            $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
            await skinFunc.mergeNumaSkinJSON()
            await skinFunc.exportLibrary()
            $('#addNewSkinContent').fadeOut()
        },
        false
    )
    if (file) {
        reader.readAsDataURL(file)
    } else {
        if (slim) {
            skinImage = skinOriginImg.alexSkinImage
            modelImage = skinOriginImg.alexModelImage
        } else {
            skinImage = skinOriginImg.steveSkinImage
            modelImage = skinOriginImg.steveModelImage
        }
        skinFunc.addSkinJSON(created, name, skinImage, modelImage, slim, null)

        $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
        await skinFunc.mergeNumaSkinJSON()
        await skinFunc.exportLibrary()
        $('#addNewSkinContent').fadeOut()
    }
})

// スキン新規追加画面を閉じる
$('.closeAddNewSkin, input.closeAddNewSkin').on('click', function () {
    $('#addNewSkinContent').fadeOut()
})

// 新規追加画面の3dViewerリアルタイム反映
$('#skinAddBox, #skinAddModelClassic, #skinAddModelSlim').on(
    'change',
    function () {
        const variant = $('input:radio[name="skinAddModel"]:checked').val()
        const file = $('#skinAddBox').prop('files')[0]
        const reader = new FileReader()
        reader.addEventListener(
            'load',
            function () {
                const skinURL = reader.result
                skinFunc.addSkinPreview(variant, skinURL)
            },
            false
        )

        if (file) {
            reader.readAsDataURL(file)
        } else {
            if (variant == 'classic') {
                skinFunc.addSkinPreview(variant, skinOriginImg.steveSkinImage)
            } else {
                skinFunc.addSkinPreview(variant, skinOriginImg.alexSkinImage)
            }
        }
    }
)

/*----------------------
既存のスキンを編集する
----------------------*/

// スキン一覧の操作パネルを開く
$('.selectSkin__Wrap').on('click', '.skinEditPanel', function () {
    $(this).next('.selectSkin__btn__inner').toggleClass('is-view')
})

// ライブラリにあるスキンの編集画面を開く
let editSkinSelectedImage = ''
$('.selectSkin__Wrap').on('click', '.editSkinBox', function () {
    $('#editSkinContent').fadeIn()
    const dataID = $(this).data('id')
    const targetSkin = skinFunc.changeSkinPickJson(dataID)
    $('#editSkinContent .editSave, #editSkinContent .editSaveAndUse').attr(
        'data-id',
        dataID
    )
    const name = targetSkin.name
    const skinImage = targetSkin.skinImage
    const slim = targetSkin.slim

    $('input[name="skinEditName"]').val(name)
    let variant = ''
    if (slim) {
        $('input[name="skinEditModel"][value="classic"]').prop('checked', false)
        $('input[name="skinEditModel"][value="slim"]').prop('checked', true)
        variant = 'slim'
    } else {
        $('input[name="skinEditModel"][value="classic"]').prop('checked', true)
        $('input[name="skinEditModel"][value="slim"]').prop('checked', false)
        variant = 'classic'
    }
    skinFunc.editSkinPreview(variant, skinImage)
    editSkinSelectedImage = skinImage
})

// 変更・編集して保存（着替える）
$('input.editSaveAndUse').on('click', async function () {
    $('.changeSkin__overlay').fadeIn()
    const key = $(this).data('id')
    const name = $('input:text[name="skinEditName"]').val()
    const variant = $('input:radio[name="skinEditModel"]:checked').val()
    const targetSkin = skinFunc.changeSkinPickJson(key)
    const nowSkin = targetSkin.skinImage
    console.log(key)
    let slim = ''
    if (variant == 'slim') {
        slim = true
    } else {
        slim = false
    }
    const now = new Date()
    const updated = now.toISOString()
    const file = $('#skinEditBox').prop('files')[0]
    const reader = new FileReader()
    reader.addEventListener(
        'load',
        async function () {
            const skinImage = reader.result
            const modelImage = await skinFunc.generateSkinModel(skinImage)
            await skinFunc.uploadSkin(variant, file)
            const textureID = await skinFunc.getTextureID()
            skinFunc.editSkinJSON(
                key,
                name,
                modelImage,
                skinImage,
                slim,
                updated,
                textureID
            )
            $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
            await skinFunc.mergeNumaSkinJSON()
            await skinFunc.exportLibrary()
            $('#editSkinContent').fadeOut()
            $('.changeSkin__overlay').fadeOut()
            skinFunc.initEditSkinPreview()
        },
        false
    )
    if (file) {
        reader.readAsDataURL(file)
    } else {
        const res = await fetch(nowSkin)
        const blob = await res.blob()
        const file = new File([blob], name, { type: 'image/png' })
        await skinFunc.uploadSkin(variant, file)
        const textureID = await skinFunc.getTextureID()
        skinFunc.editSkinJSON(key, name, null, null, slim, updated, textureID)
        $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
        await skinFunc.mergeNumaSkinJSON()
        await skinFunc.exportLibrary()
        $('#editSkinContent').fadeOut()
        $('.changeSkin__overlay').fadeOut()
        skinFunc.initEditSkinPreview()
    }
})

// 変更・編集して保存 (着替えない)
$('input.editSave').on('click', async function () {
    const key = $(this).data('id')
    const name = $('input:text[name="skinEditName"]').val()
    const variant = $('input:radio[name="skinEditModel"]:checked').val()
    let slim = ''
    if (variant == 'slim') {
        slim = true
    } else {
        slim = false
    }
    const now = new Date()
    const updated = now.toISOString()
    const file = $('#skinEditBox').prop('files')[0]
    const reader = new FileReader()
    reader.addEventListener(
        'load',
        async function () {
            const skinImage = reader.result
            const modelImage = await skinFunc.generateSkinModel(skinImage)
            skinFunc.editSkinJSON(
                key,
                name,
                modelImage,
                skinImage,
                slim,
                updated,
                null
            )
            $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
            await skinFunc.mergeNumaSkinJSON()
            await skinFunc.exportLibrary()
            $('#editSkinContent').fadeOut()
            skinFunc.initEditSkinPreview()
        },
        false
    )
    if (file) {
        reader.readAsDataURL(file)
    } else {
        skinFunc.editSkinJSON(key, name, null, null, slim, updated, null)
        $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
        await skinFunc.mergeNumaSkinJSON()
        await skinFunc.exportLibrary()
        $('#editSkinContent').fadeOut()
        skinFunc.initEditSkinPreview()
    }
})

// スキン編集画面を閉じる
$('.closeEdit, input.closeEdit').on('click', function () {
    $('#editSkinContent').fadeOut()
    skinFunc.initEditSkinPreview()
})

// 編集画面の3dViewerリアルタイム反映
$('#skinEditBox, #skinEditModelClassic, #skinEditModelSlim').on(
    'change',
    function () {
        const variant = $('input:radio[name="skinEditModel"]:checked').val()
        const file = $('#skinEditBox').prop('files')[0]
        const reader = new FileReader()
        reader.addEventListener(
            'load',
            function () {
                const skinURL = reader.result
                skinFunc.editSkinPreview(variant, skinURL)
            },
            false
        )
        if (file) {
            reader.readAsDataURL(file)
        } else {
            if (variant == 'classic') {
                skinFunc.editSkinPreview(variant, editSkinSelectedImage)
            } else {
                skinFunc.editSkinPreview(variant, editSkinSelectedImage)
            }
        }
    }
)

/*----------------------
既存のスキンを使用する
----------------------*/

// ライブラリにあるスキンに着替える
$('.selectSkin__Wrap').on('click', '.useSelectSkin', function () {
    $('.changeSkin__overlay').fadeIn()
    const targetSkin = skinFunc.changeSkinPickJson($(this).data('id'))
    const name = targetSkin.name
    const skinImage = targetSkin.skinImage
    const slim = targetSkin.slim
    const skinURL = skinImage
    let variant = ''

    if (slim) {
        variant = 'slim'
    } else {
        variant = 'classic'
    }

    fetch(skinURL)
        .then((res) => res.blob())
        .then(async (blob) => {
            const file = new File([blob], name, { type: 'image/png' })
            await skinFunc.uploadSkin(variant, file)
        })
    setTimeout(function () {
        $('.changeSkin__overlay').fadeOut()
    }, 1500)
})

/*----------------------
既存のスキンを削除する
----------------------*/

// 削除するウィンドウを表示する
$('.selectSkin__Wrap').on('click', '.deleteSkinBox', function () {
    const deleteSkinID = $(this).data('id')
    const deleteSkinModelImg = $(
        `.libraryListImg[data-id='${deleteSkinID}']`
    ).attr('src')
    const deleteSkinName = $(this).data('name')
    const deleteWindow = `<div class="deleteSkin__popup">
        <div class="deleteSkin__popup__inner">
            <p class="deleteSkin__popup__text">以下のスキンを削除してもよろしいですか？</p>
            <div class="deleteSkin__popup__img">
                <img src="${deleteSkinModelImg}" />
            </div>
            <p class="deleteSkin__popup__name">${deleteSkinName}</p>
            <div>
                <input type="button" class="deleteSkin__popup--cancel cancelDelete" value="キャンセル">
                <input type="button" class="deleteSkin__popup--delete executeDelete" data-id="${deleteSkinID}" value="削除">
            </div>
        </div>
    </div>`
    $('#newsContent').append(deleteWindow)
})

// スキンをライブラリから削除を実行する
$('#newsContent').on('click', '.executeDelete', async function () {
    const deleteSkinID = $(this).data('id')
    await skinFunc.deleteSkinJSON(deleteSkinID)
    await skinFunc.exportLibrary()
    $('.deleteSkin__popup').remove()
})

// 削除するウィンドウを閉じる
$('#newsContent').on('click', '.cancelDelete', function () {
    $(this).parents('.deleteSkin__popup').remove()
    console.log('削除ウィンドウを閉じました')
})

/*----------------------
既存のスキンを複製する
----------------------*/

// スキンをライブラリに複製する
$('.selectSkin__Wrap').on('click', '.copySkinBox', async function () {
    const key = $(this).data('id')
    const now = new Date()
    const updated = now.toISOString()
    skinFunc.copySkinJSON(key, updated)
    $('.selectSkin__Wrap').children('.skinLibraryItem').remove()
    await skinFunc.mergeNumaSkinJSON()
    await skinFunc.exportLibrary()
})

/*----------------------
jsonの呼び出し・同期設定をする
----------------------*/

// セッティング画面を閉じる
$('.closeSettingSkinData').on('click', function () {
    $('#settingSkinData').fadeOut()
})

//セッティング画面を開く
$('.openSettingSkinEditor').on('click', function () {
    $('#settingSkinData').fadeIn()
    const target = skinFunc.changeSkinSettingJSON()
    const sync = target.sync
    const myOriginSkinPath = target.myOriginSkinPath
    $('input:text[name="importOriginSkinPath"]').val(myOriginSkinPath)
    if (sync) {
        $('input:radio[name="syncSkin"][value="true"]').prop('checked', true)
        $('input:radio[name="syncSkin"][value="false"]').prop('checked', false)
    } else {
        $('input:radio[name="syncSkin"][value="true"]').prop('checked', false)
        $('input:radio[name="syncSkin"][value="false"]').prop('checked', true)
    }
})

// 初回起動時に公式ランチャーからスキン情報をインポートする
$('.importSkin').on('click', async function () {
    skinFunc.importOriginalSkinJSON()
    await skinFunc.mergeNumaSkinJSON()
    await skinFunc.exportLibrary()
})

// 公式ランチャーの保存先を任意で指定する場合のインポート
$('.importMyOriginSkin').on('click', async function () {
    const originPath = $('input#resultMyOriginSkinPath').val()
    skinFunc.saveMyOriginSkinPath(originPath)
    skinFunc.importMySettingOriginalSkinJSON()
    await skinFunc.mergeNumaSkinJSON()
    await skinFunc.exportLibrary()
})

// スキンの同期設定をする
$('.saveSettingSkin').on('click', async function () {
    const checkSyncValue = $('input:radio[name="syncSkin"]:checked').val()
    const sync = checkSyncValue == 'true'
    skinFunc.saveSkinSetting(sync)
    if (sync) {
        await skinFunc.mergeNumaSkinJSON()
        await skinFunc.exportLibrary()
    }
})

// 自分で公式ランチャーのスキンJSONを指定する
$('#selectMyOriginSkinPath').on('click', async function () {
    const { dialog } = require('electron').remote

    try {
        let result = await dialog.showOpenDialog(null, {
            properties: ['openFile'],
            title: 'launcher_skins.jsonを選択',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        })
        if (!result.canceled) {
            const path = result.filePaths[0]
            $('input#resultMyOriginSkinPath').val(path)
        }
    } catch (error) {
        console.log(error)
    }
})

// 独自ランチャーの入力値がある場合
$('input[name="importMyOriginSkinJSON"]').on('click', function () {
    const path = $('input:text[name="importOriginSkinPath"]').val()
    if (path === '') {
        $('.errMessage--inputPath').fadeIn()
    } else {
        $('.errMessage--inputPath').fadeOut()
    }
})
