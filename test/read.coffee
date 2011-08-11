torrent = require '../src/torrent'

file = './ayumi.torrent'
file = './ubuntu.torrent'
file = './torrents/futurama.torrent'
file = './files/click.jpg.torrent'
file = './files.torrent'
file = './torrents/virtualbox.torrent'
#file = './torrents/zazen.torrent'
#file = './test.torrent'
#file = process.argv[2]

torrent.readFile file, (err, hash, result) ->
  throw err if err
  console.log hash
  console.log result.announce
  console.log result.info.files
  console.log result.info.name
  console.log result.info['piece length']
  console.log Buffer.isBuffer result.info.pieces
  console.log result.info.pieces.length
