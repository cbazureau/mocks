const fs = require('fs')
const cors = require('cors')
const session = require('express-session')
const chalk = require('chalk')
const bodyParser = require('body-parser')
const gconfig = require('./config/config')

let configList = {}
let mocks = []
let project = null
let projects = []
let config = null


// npm start
// npm start project1
const args = process.argv.slice(2)

const request = require('request').defaults({
  strictSSL: false,
  rejectUnauthorized: false,
  pool: {
    maxSockets: 50
  }
})

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true)
  },
  credentials: true
}



/**
 * Removes a module from the cache
 */
require.uncache = moduleName => {
  require.searchCache(moduleName, function(mod) {
    delete require.cache[mod.id]
  })
  Object.keys(module.constructor._pathCache).forEach(function(cacheKey) {
    if (cacheKey.indexOf(moduleName) > 0) {
      delete module.constructor._pathCache[cacheKey]
    }
  })
}

/**
 * Runs over the cache to search for all the cached
 * files
 */
require.searchCache = (moduleName, callback) => {
  var mod = require.resolve(moduleName)
  if (mod && ((mod = require.cache[mod]) !== undefined)) {
    (function run(mod) {
      mod.children.forEach(function(child) {
        run(child)
      })
      callback(mod)
    })(mod)
  }
}

// ---------------------------
// Serveur HTTP
// ---------------------------
const express = require('express')
const app = express()
app.use(express.static(__dirname + '/public'))
app.use(cors(corsOptions))
app.use(session({
  secret: 'mockme',
  resave: false,
  secure: false,
  httpOnly: false,
  saveUninitialized: true
}))
app.use(function(req, res, next) {
  if (req && req.session && !req.session.mocks)
    req.session.mocks = JSON.parse(JSON.stringify(mocks))
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
  res.header('Expires', '-1')
  res.header('Pragma', 'no-cache')
  next()
})

// Reload config
function reloadConfig(prj, callback) {
  projects = []
  console.log('reloadConfig : ' + __dirname + '/config/')
  configList = {}
  fs.readdir(__dirname + '/config', (err, files) => {
    files.forEach(file => {
      if (file.indexOf('pconfig.js') > -1) {
        const key = file.replace('.pconfig.js', '')
        require.uncache('./config/' + file)
        configList[key] = require('./config/' + file)
        projects.push({
          key: key,
          name: configList[key].name
        })
      }
    })
    project = (prj && configList[prj]) ? prj : Object.keys(configList)[0]
    config = configList[project]
    callback()
  })

}

// Rebuild mocks
function rebuildMocks(req, callback) {
  mocks = []
  let temp = config ? config.mocks : []
  for (const uri in temp) {
    if (config.mocks.hasOwnProperty(uri)) {
      for (const method in config.mocks[uri].responses) {
        if (config.mocks[uri].responses.hasOwnProperty(method)) {
          for (const mockname in config.mocks[uri].responses[method]) {
            if (config.mocks[uri].responses[method].hasOwnProperty(mockname)) {
              const currentMock = config.mocks[uri].responses[method][mockname]
              const mock = {
                'uri': uri,
                'method': method,
                'name': mockname,
                'file': __dirname + '/mocks/' + currentMock.response,
                'fileDisplay': currentMock.response,
                'duration': currentMock.duration ? currentMock.duration : (config.mocks[uri].duration ? config.mocks[uri].duration : 100),
                'httpcode': currentMock.httpcode ? currentMock.httpcode : (config.mocks[uri].httpcode ? config.mocks[uri].httpcode : 200),
                'active': (mockname === 'default')
              }
              mocks.push(mock)
            }
          }
        }
      }
    }
  }
  mocks.sort(function(a, b) {
    if (a.uri < b.uri) return -1
    if (a.uri > b.uri) return 1
    if (a.name === 'default') return -1
    if (b.name === 'default') return 1
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })
  if (req && req.session)
    req.session.mocks = JSON.parse(JSON.stringify(mocks))
  callback()
}

// Set a mock
function setMock(req, uri, method, name, callback) {
  console.log(chalk.blue('Url ' + method + ' ' + uri + ' activation du cas ' + name))
  env = 'mck'
  for (var m = 0; m < mocks.length; m++) {
    var mock = req.session.mocks[m]
    if (mock.uri === uri && mock.method === method) {
      req.session.mocks[m].active = (mock.name === name)
    }
  }
  callback()
}

// send mocks to IHM
function sendMock(req) {
  return {
    returnCode: 'SUCCESS',
    severity: 'SUCCESS',
    data: {
      mocks: (req && req.session) ? req.session.mocks : mocks,
      projects,
      project
    },
    message: ''
  }
}

/**
 * /internal/mocks
 */
app.get('/internal/mocks', function(req, res) {
  res.send(sendMock(req))
})

/**
 * /internal/mocks/:mockName
 */
app.put('/internal/mocks', bodyParser.json(), function(req, res) {
  setMock(req, req.body.uri, req.body.method, req.body.name, function() {
    res.send(sendMock(req))
  })
})

/**
 * /internal/rebuild
 */
app.get('/internal/rebuild', function(req, res) {
  // Rechargement à chaud des fichiers de configuration
  reloadConfig(req.query.app, () => {

    rebuildMocks(req, () => {
      console.log(chalk.blue('Rebuild de la configuration'))
      res.send(sendMock(req))
    })
  })
})

/**
 * Mocks des urls de l'API BUS
 */
app.use('/', function(req, res) {
  var path = '' + require('url').parse(req.url, true).pathname

  for (var m = 0; m < req.session.mocks.length; m++) {
    var mock = req.session.mocks[m]
    if (mock.uri === path
      && mock.method === req.method
      && mock.active === true) {
      console.log('[MOCK] ' + mock.method + ' ' + mock.uri + ' (' + mock.name + ') (' + mock.httpcode + ')')
      setTimeout(function() {
        var fs = require('fs')
        var obj
        fs.readFile(mock.file, 'utf8', function(err, data) {
          if (err)
            throw err
          if (mock.file.split('.').pop() === 'json') {
            obj = JSON.parse(data)
          } else
            obj = data
          res.status(mock.httpcode).send(obj)
        })
      }, mock.duration)
      return
    }
  }
  console.log("[MOCK] Pas de mock pour l'appel à " + path + ' en ' + req.method + ' !')
  res.status(404).send("Pas de mock pour l'appel à " + path + ' en ' + req.method + ' !')

})

// ---------------------------
// Démarrage du serveur
// ---------------------------
var server = app.listen(gconfig.port, function() {
  console.log(chalk.green('------------------------------'))
  console.log(chalk.green(' __  __            _       '))
  console.log(chalk.green('|  \\/  | ___   ___| | _____ '))
  console.log(chalk.green('| |\\/| |/ _ \\ / __| |/ / __|'))
  console.log(chalk.green('| |  | | (_) | (__|   <\\__ \\'))
  console.log(chalk.green('|_|  |_|\\___/ \\___|_|\\_\\___/'))
  console.log(chalk.green('                            '))
  console.log(chalk.green('------------------------------'))
  console.log(chalk.green('Ouvrir votre navigateur sur http://localhost:' + gconfig.port))
  reloadConfig(args[0], () => {
    rebuildMocks(null, () => {
      console.log(chalk.green('Rebuild de la configuration'))
    })
  })
})
