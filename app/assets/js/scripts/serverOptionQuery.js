const LZString = require('lz-string')
const crypto = require('crypto')

const MOD_TYPES = new Set(['ForgeMod', 'LiteMod', 'LiteLoader', 'FabricMod'])

// ============================================================
// Hash Map (collision-free short hash for mod IDs)
// ============================================================

function shortHash(str, len) {
    return crypto.createHash('md5').update(str).digest('hex').slice(0, len)
}

/**
 * Build a collision-free bidirectional hash map from all mod IDs.
 * Both encoder and decoder produce identical maps from the same input.
 * Hash length starts at 4 and grows globally until no collisions exist.
 */
function buildHashMap(allModIds) {
    for (let len = 4; len <= 32; len++) {
        const idToHash = {}
        const hashToId = {}
        let collision = false
        for (const id of allModIds) {
            const hash = shortHash(id, len)
            if (hash in hashToId) {
                collision = true
                break
            }
            idToHash[id] = hash
            hashToId[hash] = id
        }
        if (!collision) return { idToHash, hashToId }
    }
    throw new Error('Unable to build collision-free hash map')
}

// ============================================================
// Distribution helpers
// ============================================================

/**
 * Recursively collect all optional mod IDs and their default values.
 * Returns a flat map: { mavenId: defaultBoolean }
 */
function collectModDefaults(modules) {
    const defaults = {}
    for (const mdl of modules) {
        if (!MOD_TYPES.has(mdl.rawModule.type)) continue
        if (!mdl.getRequired().value) {
            defaults[mdl.getVersionlessMavenIdentifier()] = mdl.getRequired().def
        }
        if (mdl.subModules.length > 0) {
            Object.assign(defaults, collectModDefaults(mdl.subModules))
        }
    }
    return defaults
}

/**
 * Collect all optional mod IDs (sorted) for hash map construction.
 */
function collectAllModIds(modules) {
    const ids = []
    for (const mdl of modules) {
        if (!MOD_TYPES.has(mdl.rawModule.type)) continue
        if (!mdl.getRequired().value) {
            ids.push(mdl.getVersionlessMavenIdentifier())
        }
        if (mdl.subModules.length > 0) {
            ids.push(...collectAllModIds(mdl.subModules))
        }
    }
    return ids.sort()
}

// ============================================================
// Flatten / Rebuild mod config tree
// ============================================================

/**
 * Flatten a nested mod config to { mavenId: boolean } pairs.
 * Only extracts values for optional mods (those with boolean or value property).
 */
function flattenModConfig(mods) {
    const flat = {}
    for (const [key, val] of Object.entries(mods)) {
        if (typeof val === 'boolean') {
            flat[key] = val
        } else if (typeof val === 'object' && val !== null) {
            if (typeof val.value === 'boolean') {
                flat[key] = val.value
            }
            if (val.mods) {
                Object.assign(flat, flattenModConfig(val.mods))
            }
        }
    }
    return flat
}

/**
 * Rebuild nested mod config tree from a flat map, matching the structure
 * produced by scanOptionalSubModules in uibinder.js.
 */
function rebuildModConfig(flatMap, modules) {
    const mods = {}
    for (const mdl of modules) {
        if (!MOD_TYPES.has(mdl.rawModule.type)) continue
        const id = mdl.getVersionlessMavenIdentifier()
        const isOptional = !mdl.getRequired().value

        if (isOptional) {
            if (mdl.subModules.length > 0) {
                const subMods = rebuildModConfig(flatMap, mdl.subModules)
                if (Object.keys(subMods).length > 0) {
                    mods[id] = {
                        value: id in flatMap ? flatMap[id] : mdl.getRequired().def,
                        mods: subMods
                    }
                } else {
                    mods[id] = id in flatMap ? flatMap[id] : mdl.getRequired().def
                }
            } else {
                mods[id] = id in flatMap ? flatMap[id] : mdl.getRequired().def
            }
        } else {
            // Required mod - only include if it has sub-mods with config entries
            if (mdl.subModules.length > 0) {
                const subMods = rebuildModConfig(flatMap, mdl.subModules)
                if (Object.keys(subMods).length > 0) {
                    mods[id] = { mods: subMods }
                }
            }
        }
    }
    return mods
}

// ============================================================
// Encode (v2: short hash + differential)
// ============================================================

/**
 * Encode mod configuration to a compact URL string.
 * Format: v2.<serverId>.<hash>:<0|1>,<hash>:<0|1>,...
 * Only mods that differ from their distribution defaults are included.
 *
 * @param {Object} modConf  The mod configuration { id, mods }
 * @param {Object} server   The distribution server object
 */
function encodeModConfig(modConf, server) {
    const modules = server.modules
    const defaults = collectModDefaults(modules)
    const allIds = collectAllModIds(modules)
    const { idToHash } = buildHashMap(allIds)
    const flat = flattenModConfig(modConf.mods)

    // Collect diffs from defaults
    const diffs = []
    for (const [id, defaultVal] of Object.entries(defaults)) {
        const currentVal = id in flat ? flat[id] : defaultVal
        if (currentVal !== defaultVal) {
            diffs.push(`${idToHash[id]}:${currentVal ? 1 : 0}`)
        }
    }

    return `v2.${modConf.id}.${diffs.join(',')}`
}

// ============================================================
// Decode
// ============================================================

/**
 * Decode a v2 compact string back into a full mod configuration object.
 *
 * @param {string} encoded  The v2 encoded string
 * @param {Object} distro   The full distribution object
 * @returns {Object|null}   The mod configuration { id, mods } or null on failure
 */
function decodeModConfig(encoded, distro) {
    try {
        const parts = encoded.split('.')
        if (parts.length < 3 || parts[0] !== 'v2') return null

        const serverId = parts[1]
        const diffStr = parts.slice(2).join('.')  // Rejoin in case serverId has dots
        const server = distro.getServerById(serverId)
        if (!server) return null

        const modules = server.modules
        const defaults = collectModDefaults(modules)
        const allIds = collectAllModIds(modules)
        const { hashToId } = buildHashMap(allIds)

        // Start from defaults
        const flatMap = { ...defaults }

        // Apply diffs
        if (diffStr.length > 0) {
            for (const entry of diffStr.split(',')) {
                const [hash, valStr] = entry.split(':')
                const modId = hashToId[hash]
                if (modId) {
                    flatMap[modId] = valStr === '1'
                }
            }
        }

        return {
            id: serverId,
            mods: rebuildModConfig(flatMap, modules)
        }
    } catch (err) {
        console.error('v2 decode error:', err)
        return null
    }
}

// ============================================================
// Public API (with backward compatibility)
// ============================================================

async function generateURL() {
    const serv = ConfigManager.getSelectedServer()
    const modConf = ConfigManager.getModConfiguration(serv)
    const distro = await DistroAPI.getDistribution()
    const server = distro.getServerById(serv)
    return `https://teamkun.github.io/NumaLauncherRedirectPage/?query=${encodeModConfig(modConf, server)}`
}

async function generateDiscordString() {
    const eventName = document.getElementById('settingsEventNameVal').value
    const settingsServer = document.getElementById('settingsServerIPVal').value

    const message = [
        `# ${eventName}`,
        '### サーバーIP:',
        '```',
        settingsServer,
        '```',
        '### 起動リンク:',
        await generateURL()
    ].join('\n')
    return message
}

/**
 * Decode a query string. Supports both v2 (compact) and v1 (LZString) formats.
 */
async function decodeUrlToJson(encodedStr) {
    // Try v2 format first
    if (encodedStr.startsWith('v2.')) {
        const distro = await DistroAPI.getDistribution()
        const result = decodeModConfig(encodedStr, distro)
        if (result) return result
    }

    // Fallback: v1 LZString format
    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(encodedStr)
        if (!decompressed) {
            throw new Error('Decompression failed or returned null.')
        }
        return JSON.parse(decompressed)
    } catch (err) {
        console.error('JSON decode error:', err)
        return null
    }
}

exports.generateURL = generateURL
exports.generateDiscordString = generateDiscordString
exports.decodeUrlToJson = decodeUrlToJson
exports.encodeModConfig = encodeModConfig
exports.decodeModConfig = decodeModConfig
