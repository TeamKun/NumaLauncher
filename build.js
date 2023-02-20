const builder = require('electron-builder')
const Platform = builder.Platform

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
            '!{dist,.gitignore,.vscode,docs,dev-app-update.yml,.travis.yml,.nvmrc,.eslintrc.json,build.js,numa_skins.json,skinSetting.json,jdk}'
        ],
        extraResources: [
            'libraries',
            //`jdk/${getJDKDirectory()}`
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
