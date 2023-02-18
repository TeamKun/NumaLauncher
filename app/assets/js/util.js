const root = require('app-root-path');
const path = require('path')
const isDev = require('./isdev')
const os = require('os')

class Util {

    /**
     * Returns true if the actual version is greater than
     * or equal to the desired version.
     * 
     * @param {string} desired The desired version.
     * @param {string} actual The actual version.
     */
    static mcVersionAtLeast(desired, actual) {
        const des = desired.split('.')
        const act = actual.split('.')

        for (let i = 0; i < des.length; i++) {
            if (!(parseInt(act[i]) >= parseInt(des[i]))) {
                return false
            }
        }
        return true
    }

    static getJDKVersion() {
        const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()

        if (!Util.mcVersionAtLeast('1.16', mcVersion)) {
            // x < MC1.16
            return '8'

        } else if (!Util.mcVersionAtLeast('1.18', mcVersion)) {
            // MC1.16 <= x < MC1.18
            return '16'

        } else {
            // MC1.18 <= x
            return '17'
        }
    }

    static getJDKVersionAdoptium(major) {
        switch (major) {
            case '8':
                return '8u302b08'
            case '16':
                return '16.0.2+7'
            default:
            case '17':
                return '17.0.4.1+1'
        }
    }

    static getJDKVersionCorretto(major) {
        switch (major) {
            case '8':
                return '8.362.08.1'
            case '16':
                return '16.0.2.7.1'
            default:
            case '17':
                return '17.0.4.9.1'
        }
    }

    static getJDKPath() {
        const jdkMajorVersion = Util.getJDKVersion()
        const basePath = path.join(ConfigManager.getDataDirectory(), "runtime")

        let sanitizedOS
        switch (process.platform) {
            case 'win32':
                sanitizedOS = 'windows'
                break
            case 'darwin':
                if (Util.isAappleSilicon()) {
                    sanitizedOS = 'mac-apple'
                } else {
                    sanitizedOS = 'mac-intel'
                }
                break
            case 'linux':
                sanitizedOS = 'linux'
                break
            default:
                return ConfigManager.getJavaExecutable()
        }

        const jdkPath = path.join(basePath, sanitizedOS, jdkMajorVersion)
        
        console.log(jdkPath)
        return jdkPath
    }

    static isForgeGradle3(mcVersion, forgeVersion) {

        if (Util.mcVersionAtLeast('1.13', mcVersion)) {
            return true
        }

        try {

            const forgeVer = forgeVersion.split('-')[1]

            const maxFG2 = [14, 23, 5, 2847]
            const verSplit = forgeVer.split('.').map(v => Number(v))

            for (let i = 0; i < maxFG2.length; i++) {
                if (verSplit[i] > maxFG2[i]) {
                    return true
                } else if (verSplit[i] < maxFG2[i]) {
                    return false
                }
            }

            return false

        } catch (err) {
            throw new Error('Forge version is complex (changed).. launcher requires a patch.')
        }
    }

    static isAutoconnectBroken(forgeVersion) {

        const minWorking = [31, 2, 15]
        const verSplit = forgeVersion.split('.').map(v => Number(v))

        if (verSplit[0] === 31) {
            for (let i = 0; i < minWorking.length; i++) {
                if (verSplit[i] > minWorking[i]) {
                    return false
                } else if (verSplit[i] < minWorking[i]) {
                    return true
                }
            }
        }

        return false
    }

    static isAappleSilicon() {
        const reg = /^Apple/
        os.cpus()

        if (reg.test(os.cpus()[0].model)) {
            return true
        }

        return false
    }

    static varidatePlatform() {
        const MC_VERSION = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
        const IS_APPLE_SILICON = Util.isAappleSilicon()

        if (!IS_APPLE_SILICON) {
            return null
        }

        // 1.12-
        if (!Util.mcVersionAtLeast('1.13',MC_VERSION)) {
            return null
        }

        // 1.16 ~ 1.18
        if (!Util.mcVersionAtLeast('1.19', MC_VERSION)) {
            return {
                title: 'SORRY!!',
                disc: `沼ランチャーでは現在、AppleSiliconプロセッサで</br>MC${MC_VERSION}</br>を起動することができません。`,
            }
        }

        // 1.19+
        return null
    }

    /**
     * サーバー名からオーダー番号取り除く
     * */
    static removeOrderNumber(serverName) {
        let reg = /^%*%/
        if (!reg.test(serverName)) {
            return serverName
        }

        return serverName.split('%')[2]
    }

    /**
     * カタカナをひらがなに変換
     * */
    static kanaToHira(str) {
        return str.replace(/[\u30a1-\u30f6]/g, function(match) {
            let chr = match.charCodeAt(0) - 0x60;
            return String.fromCharCode(chr);
        });
    }
}

module.exports = Util