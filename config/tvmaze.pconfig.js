exports.name = "TV Maze"
exports.mocks = {
  '/search/shows': {
    'duration': 150, // simule 150 milliseconde
    'httpcode': 200, // par défaut 200 (surchargeable ici)
    'responses': {
      'GET': { // La méthode
        'default': { // le nom du bouchon
          'duration': 110, // surchargeable ici
          'httpcode': 200, // par défaut 200 (et surchargeable ici)
          'response': 'tvmaze/search/shows/default-GET.json'
        },
        '404': {
          'httpcode': 404,
          'response': 'commons/404.html'
        }
      }
    }
  },
  '/shows/1': {
    'responses': {
      'GET': {
        'default': {
          'response': 'tvmaze/shows/1/default-GET.json'
        },
        '404': {
          'httpcode': 404,
          'response': 'commons/404.html'
        }
      }
    }
  }
}