nt = require '../src/torrent'

nt.make 'http://faketracker.com',
  #  'click.jpg', './files'
  './files', ['click.jpg', 'heart.jpg'], { name: 'files' },
  (err, hash, pieces, torrent) ->
    throw err if err
    hash.on 'end', (result) ->
      console.log nt.getInfoHash result

