const root = require('app-root-path');
const path = require('path')

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

    static getJDKPath() {
        let mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
        let basePath, jdkMajorVersion, sanitizedOS, midwayPath, fileName

        // less than MC1.17
        if (!Util.mcVersionAtLeast('1.17', mcVersion)) {
            jdkMajorVersion = '8'

            // MC1.17
        } else if (!Util.mcVersionAtLeast('1.18', mcVersion)) {
            jdkMajorVersion = '16'

            // MC1.18+
        } else {
            jdkMajorVersion = '17'
        }

        // 一旦windowsのみ対応
        switch (process.platform) {
            case 'win32':
                sanitizedOS = 'windows'
                midwayPath = 'bin'
                fileName = 'javaw.exe'
                basePath = path.join(process.cwd(), 'Resources', 'jdk')
                break
            case 'darwin':
                sanitizedOS = 'mac'
                midwayPath = path.join('Contents', 'Home', 'bin')
                fileName = 'java'
                // process.cwdでは正常にパスが取得できないので__dirnameで対応
                // exp: /Applications/NumaLauncher.app/Contents/Resources/jdk/mac/16/Contents/Home/bin/java
                basePath = path.join(__dirname, '../../../..', 'jdk')
                break
            case 'linux':
                sanitizedOS = 'linux'
                midwayPath = 'bin'
                fileName = 'java'
                basePath = path.join(process.cwd(), 'resources', 'jdk')
                break
            default:
                return ConfigManager.getJavaExecutable()
        }

        let jdkPath = path.join(basePath, sanitizedOS, jdkMajorVersion, midwayPath, fileName);
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

}

module.exports = Util
