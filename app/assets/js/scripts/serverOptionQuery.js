const LZString = require('lz-string')

function generateURL() {
    const serv = ConfigManager.getSelectedServer()
    return `numalauncher://?query=${encodeJsonToUrl(ConfigManager.getModConfiguration(serv))}`
}

function generateDiscordString() {
    const eventName = document.getElementById("settingsEventNameVal").value
    const settingsServer = document.getElementById("settingsServerIPVal").value

    const message = [
        `# ${eventName}`,
        '### サーバーIP:',
        '```',
        settingsServer,
        '```',
        '### 起動リンク:',
        generateURL()
      ].join('\n');
    return message
}

function encodeJsonToUrl(jsonObj) {
    return LZString.compressToEncodedURIComponent(JSON.stringify(jsonObj));
}

function decodeUrlToJson(encodedStr) {
    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(encodedStr);
        if (!decompressed) {
            throw new Error("Decompression failed or returned null.");
        }
        return JSON.parse(decompressed);
    } catch (err) {
        console.error("JSON decode error:", err);
        return null;
    }
}

exports.encodeJsonToUrl=encodeJsonToUrl
exports.decodeUrlToJson=decodeUrlToJson
exports.generateURL=generateURL
exports.generateDiscordString=generateDiscordString
