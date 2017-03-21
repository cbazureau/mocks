exports.name = "API test"
exports.mocks = {
  '/api/test': {
    'responses': {
      'GET': {
        'default': {
          'response': 'test/default-GET.json'
        },
        '404': {
          'httpcode': 404,
          'response': 'commons/404.html'
        }
      }
    }
  }
}