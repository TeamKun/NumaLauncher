const builder = require('electron-builder')
const Platform = builder.Platform
const fs = require('fs-extra')
const path = require('path')
const root = require('app-root-path')
const Util = require('./app/assets/js/util')

const dirName = 'jdk'
const basePath = path.join(root.path, dirName)

if (!fs.existsSync(basePath)) {
    console.log(`\x1b[31mERROR!!: ${basePath} が見つかりません`)
    console.log("\x1b[31mERROR!!: https://github.com/TeamKun/config-files/releases/download/jdk/jdk.zip をダウンロードして展開してください")
    return
}

builder.build({
    targets: (process.argv[2] != null && Platform[process.argv[2]] != null ? Platform[process.argv[2]] : getCurrentPlatform()).createTarget(),
    config: {
        appId: 'numalauncher',
        productName: 'NumaLauncher',
        artifactName: '${productName}-setup-${version}.${ext}',
        copyright: 'Copyright © 2018-2020 Daniel Scalzi, 2020 TeamKUN',
        directories: {
            buildResources: 'build',
            output: 'dist'
        },
        win: {
            target: [{
                target: 'nsis',
                arch: 'x64'
            }]
        },
        nsis: {
            oneClick: false,
            perMachine: false,
            allowElevation: true,
            allowToChangeInstallationDirectory: true
        },
        mac: {
            target: 'dmg',
            category: 'public.app-category.games'
        },
        linux: {
            target: 'AppImage',
            maintainer: 'Daniel Scalzi, TeamKUN',
            vendor: 'Daniel Scalzi, TeamKUN',
            synopsis: '沼でも使えるMinecraftランチャー',
            description: '参加型に参加するためのすべてがここに。Mod、コンフィグ、アップデートが全自動で揃います。',
            category: 'Game'
        },
        compression: 'maximum',
        files: [
            '!{dist,.gitignore,.vscode,docs,dev-app-update.yml,.travis.yml,.nvmrc,.eslintrc.json,build.js,numa_skins.json,skinSetting.json}'
        ],
        extraResources: [
            'libraries',
            `jdk/${getJDKDirectory()}`
        ],
        asar: true
    }
}).then(() => {
    console.log('Build complete!')
}).catch(err => {
    console.error('Error during build!', err)
})

function getCurrentPlatform() {
    switch (process.platform) {
        case 'win32':
            return Platform.WINDOWS
        case 'darwin':
            return Platform.MAC
        case 'linux':
            return Platform.linux
        default:
            console.error('Cannot resolve current platform!')
            return undefined
    }
}

function getJDKDirectory() {
    switch (process.argv[2]) {
        case 'WINDOWS':
            return 'windows'
        case 'MAC':
            if (Util.isAappleSilicon()) {
                return 'mac-apple'
            }
            return 'mac-intel'
        case 'LINUX':
            return 'linux'
    }
}
