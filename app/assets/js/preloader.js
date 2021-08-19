const {ipcRenderer} = require('electron')
const fs            = require('fs-extra')
const os            = require('os')
const path          = require('path')

const ConfigManager = require('./configmanager')
const DistroManager = require('./distromanager')
const LangLoader    = require('./langloader')
const logger        = require('./loggerutil')('%c[Preloader]', 'color: #a02d2a; font-weight: bold')

logger.log('Loading..')

// Load ConfigManager
ConfigManager.load()

// Load Strings
LangLoader.loadLanguage('ja_JP')

DistroManager.onDistroLoad = DistroManager.onCustomDistroLoad = function(data){
    if(data != null){
        
        // Resolve the selected server if its value has yet to be set.
        if(ConfigManager.getSelectedServer() == null || data.getServer(ConfigManager.getSelectedServer()) == null){
            logger.log('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().getID())
            ConfigManager.save()
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

// Ensure Distribution is downloaded and cached.
DistroManager.distroURL = 'https://raw.githubusercontent.com/TeamKun/ModPacks/deploy/distribution.json'
//DistroManager.distroURL = 'http://mc.westeroscraft.com/WesterosCraftLauncher/distribution.json'
//DistroManager.distroURL = 'https://gist.githubusercontent.com/dscalzi/53b1ba7a11d26a5c353f9d5ae484b71b/raw/'
DistroManager.pullRemote(DistroManager.distroURL).then((data) => {
    logger.log('Loaded distribution index.')

    DistroManager.onDistroLoad(data)

}).catch((err) => {
    logger.log('Failed to load distribution index.')
    logger.error(err)

    logger.log('Attempting to load an older version of the distribution index.')
    // Try getting a local copy, better than nothing.
    DistroManager.pullLocal().then((data) => {
        logger.log('Successfully loaded an older version of the distribution index.')

        DistroManager.onDistroLoad(data)


    }).catch((err) => {

        logger.log('Failed to load an older version of the distribution index.')
        logger.log('Application cannot run.')
        logger.error(err)

        DistroManager.onDistroLoad(null)

    })

})

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.log('Cleaned natives directory.')
    }
})