nt = require '../src/torrent'

console.time 'writing time'
file = './result/new.torrent'
nt.write file, 'http://faketracker.com',
  './files', ['click.jpg', 'heart.jpg'], (err, hash) ->
    throw err if err

    hash.on 'error', (err) -> throw err
    hash.on 'end', ->
      nt.read file, (err, hash, torrent) ->
        throw err if err
        console.log hash
