const fs = require('fs-extra')
const zlib = require('zlib');
const tar = require('tar');
const path = require('path')
const request = require('request')
const axiosBase = require('axios')
const AdmZip = require('adm-zip')
const root = require('app-root-path')
const targz = require('tar.gz')

const axios = axiosBase.create({
    headers: {
        'Content-Type': 'application/json',
    },
    responseType: 'json',
})

const dirName = 'jdk'
const basePath = path.join(root.path, dirName)
const jdkInfo = require('./jdkinfo.json')

downloiadOpenJDK()

async function downloiadOpenJDK() {
    if (fs.existsSync(basePath)) {
        _log(`INFO: ${dirName} directory already exists`)
        _log("INFO: JDK download process ignored")
        return
    }

    // 保存先を作成
    _mkdirJDK()

    // DL処理
    let task = []
    let jdkInfo = require('./jdkinfo.json')

    for (const os in jdkInfo) {
        for (const verson in jdkInfo[os]) {
            // if (os != 'mac') {
            //     continue
            // }
            if (!jdkInfo[os][verson].url) {
                continue
            }
            task.push(_downloadJDK(jdkInfo[os][verson].url,
                jdkInfo[os][verson].compressedFileName,
                jdkInfo[os][verson].extractedFileName,
                os,
                verson))
        }
    }

    Promise.all(task).then((result) => {
        _log("Download All Complete")
    })
}

async function _getLatestOpenJDK(osName, majorVersion) {
    const url = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?vendor=eclipse`
    let res = await axios(url)
    let body = res.data

    const targetBinary = body.find(entry => {
        return entry.version.major == majorVersion &&
            entry.binary.os === osName &&
            entry.binary.image_type === 'jdk' &&
            entry.binary.architecture === 'x64'
    })
    if (targetBinary != null) {
        return {
            uri: targetBinary.binary.package.link,
            size: targetBinary.binary.package.size,
            name: targetBinary.binary.package.name
        }
    } else {
        return null
    }
}

function _downloadJDK(url, compressedFileName, extractedFileName, osName, majorVersion) {
    //let fileNameWithout = _substringExtend(fileName)
    let compressedFilePath = path.join(basePath, osName, compressedFileName)

    return new Promise((resolve) => {
        request
            .get({ method: 'GET', url: url, encoding: null })
            .on('response', (res) => {
                let file = fs.createWriteStream(compressedFilePath)
                _log(`Download Start ${compressedFileName}`)
                res.pipe(file)
                file.on("finish", async() => {
                    file.close();
                    let extractedFilePath = path.join(basePath, osName, extractedFileName)
                    let outputPath = path.join(basePath, osName, majorVersion)

                    // 解凍
                    // zip
                    if (osName === 'windows') {
                        let zip = AdmZip(compressedFilePath)
                        let filePath = path.join(basePath, osName, extractedFileName)
                        zip.extractAllTo(path.join(basePath, osName), true)
                        fs.rename(extractedFilePath, outputPath)
                        fs.remove(compressedFilePath)
                        _log(`Download Completed ${compressedFileName}`)
                        resolve(true)
                    } else {
                        // tar.gz
                        await new targz().extract(compressedFilePath, path.join(basePath, osName))
                        fs.rename(extractedFilePath, outputPath)
                        fs.remove(compressedFilePath)
                        _log(`Download Completed ${compressedFileName}`)
                        resolve(true)
                    }
                })
            })
    })
}

function _mkdirJDK() {
    for (os in jdkInfo) {
        fs.mkdir(path.join(basePath, os), { recursive: true }, (err) => {
            if (err) throw err;
        });
    }
}

function _log(message) {
    console.log(`[OpenJDK-DOWNLOADER] ${message}`)
}