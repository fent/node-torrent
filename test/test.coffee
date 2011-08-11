fs   = require 'fs'
benc = require 'bncode'

file = 'test.torrent'
file = './torrents/futurama.torrent'

###
data = fs.readFileSync file, 'binary'
console.log benc.decode(data)
###

de = new benc.decoder()
fs.readFile file, (err, data) ->
  throw err if err
  de.decode data
  result = de.result()
  console.log result[0].info.pieces.toString()
  console.log result
