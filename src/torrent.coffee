url            = require 'url'
http           = require 'http'
https          = require 'https'
fs             = require 'fs'
path           = require 'path'
{EventEmitter} = require 'events'

b              = require 'bncode'
Buffers        = require 'buffers'
hash           = require './hash'
schema         = require './schema'

APP_NAME = 'node-torrent'
VERSION  = 'v0.1.0'


# returns bytes from human readable memory sizes such as 1.5MB
SIZES = /((\d)+(\.\d+)?)(k|m|g|t)?b?/i
POWERS = { k: 10, m: 20, g: 30, t: 40 }
toBytes = (str) ->
  result = SIZES.exec str
  num = parseFloat result[1]
  c = result[4].toLowerCase()
  if POWERS[c]
    Math.round num * (1 << POWERS[c])
  else
    num



# read torrent data
read = (file, requestOptions = {}, callback) ->
  if typeof requestOptions is 'function'
    callback = requestOptions

  # check if file is url
  if schema.isURL file
    readURL file, requestOptions, callback

  # check if file exists in case it's a path
  else if path.existsSync file
    readFile file, callback
  
  else
    callback new Error 'Not a URL and file does not exists'

# download torrent and read its data
readURL = (urladdr, requestOptions = {}, callback) ->
  if typeof requestOptions is 'function'
    callback = requestOptions
    requestOptions = {}

  parsed = url.parse urladdr
  protocol = parsed.protocol.substring(0, parsed.protocol.length - 1)
  switch protocol
    when 'http' then f = http
    when 'https' then f = https
    else return callback new Error "Protocol '#{protocol}' not supported"

  requestOptions.host = parsed.host
  requestOptions.port = parsed.port
  requestOptions.path = parsed.pathname +
    if parsed.search then parsed.search else '' +
    if parsed.hash then parsed.hash else ''

  buf = Buffers()
  req = f.get(requestOptions, (res) ->
    if res.statusCode isnt 200
      return callback new Error '404 file not found'

    res.on 'data', (data) ->
      try
        buf.push data
      catch err
        req.abort()
        callback err

    res.on 'end', ->
      buf = buf.toBuffer()
      schema.validate b.decode(buf), buf, callback

  ).on 'error', (err) ->
    callback err


# reads torrent from local file system
readFile = (file, callback) ->
  fs.readFile file, (err, data) ->
    return callback err if err
    schema.validate b.decode(data), data, callback


# read raw data
readRaw = (buf, callback) ->
  try
    schema.validate b.decode(buf), buf, callback

  # there might be an error decoding
  catch err
    callback err


# makes torrent file
# options =
#   announceList: [[]]
#   comment: ''
#   name: used in multifile mode
#   pieceLength: power of 2
#   private: false
#   source: '' put in info to generate different info hash
#   maxFiles: 500 # max files to open at the same time
#   maxMemory: 512MB
make = (announce, dir, files, options = {}, callback) ->
  if typeof options is 'function'
    callback = options
    options = {}

  # check announce url
  if not schema.isURL announce
    return callback new Error "Not a URL: #{announce}"

  # take care of default options
  if options.maxMemory
    maxBytes = toBytes(options.maxMemory)

  # make torrent info object
  info = {}
  if options.pieceLength
    pieceLength = 1 << options.pieceLength
  # default piece length is 256kb
  else
    pieceLength = 262144

  # check list of files
  if not Array.isArray files
    files = [files]
  else if files.length is 0
    return callback new Error 'no files given'
  else if files.length > 1 and not options.name
    return callback new Error 'must specify name in multi file mode'

  # make main torrent object and add announce url
  torrent = {}
  torrent.announce = announce

  # check and validate options announce list
  if options.announceList?
    msg = 'announce list needs to be a list of lists'
    if not Array.isArray options.announceList
      return callback new Error msg
    for innerList in options.announceList
      if not Array.isArray innerList
        return callback new Error msg
      for url in innerList
        if not schema.isURL url
          return callback new Error "Not a URL: #{url}"
    torrent['announce-list'] = options.announceList

  # check comment option
  if options.comment?
    torrent.comment = options.comment

  torrent['created by'] = "#{APP_NAME} #{VERSION}"
  torrent['creation date'] = Math.round(Date.now() / 1000)
  torrent.info = info

  # start hashing files
  hashOptions =
    maxFiles : options.maxFiles
    maxBytes : maxBytes
  hash dir, files, pieceLength, hashOptions,
    (err, emitter, pieces, files) ->
      return callback err if err

      # multi file mode
      if files.length > 1
        info.files = files
        info.name  = options.name
      # single file mode
      else
        info.length = files[0].length
        info.name   = files[0].path.join '/'
      info['piece length'] = pieceLength
      info.pieces = null
      if options.private
        info.private = 1
      if options.source
        info.source = options.source

      # listen for hashing events
      emitter.on 'error', (err) ->
        # stop hashing if there is an error reading files
        emitter.stop err
      emitter.on 'end', (pieces) ->
        info.pieces = pieces

      # return emitter object, number of pieces and torrent object
      callback null, emitter, pieces, torrent


# make and write torrent to file
write = (filename, announce, dir, files, options = {}, callback) ->
  if typeof options is 'function'
    callback = options
    options = {}
  options.name ?= path.basename filename, '.torrent'

  # check filename ends with .torrent
  if path.extname(filename) isnt '.torrent'
    filename += '.torrent'

  # open file for writing
  fs.open filename, 'w', 0666, (err, fd) ->
    return callback err if err

    make announce, dir, files, options,
      (err, hashEmitter, pieces, torrent) ->
        return callback err if err
        emitter = new EventEmitter()

        # generate fake pieces to encode it
        piecesLength = 20 * pieces
        torrent.info.pieces = new Buffer(piecesLength)

        # bencode data
        data = new Buffer b.encode(torrent), 'binary'
        strData = data.toString()
        dict = "6:pieces#{torrent.info.pieces.length}:"
        piecesPosition = strData.indexOf(dict) + dict.length
        piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition))

        # start writing to file
        fs.write fd, data, 0, data.length, 0, (err) ->
          emitter.emit 'error', err if err

        # listen for hash events
        hashEmitter.on 'hash', (index, hash, percent) ->
          # write to file piece by piece
          position = piecesPosition + index * 20
          fs.write fd, hash, 0, 20, position,
            (err) -> emitter.emit 'error', err if err
          emitter.emit 'progress', percent

        hashEmitter.on 'error', (err) ->
          hashEmitter.stop err
          emitter.emit 'error', err

        # wait until torrent object is finished being made
        hashEmitter.on 'end', ->
          fs.close fd, (err) ->
            return emitter.emit 'error', err if err
            emitter.emit 'end'

        # return emitter
        callback null, emitter, pieces, torrent


# edits a torrent file and writes it back
# faster than hashing all files again
# any options with boolean false will be removed instead of changed
edit = (file, options, callback) ->
  read file, (err, result) ->
    return callback err if err

    if options.announce
      result.announce = options.announce

    # check for optionals
    # announce list, comment, and source are optional
    if options.announceList?
      if options.announceList is false
        delete result['announce-list']
      else
        result['announce-list'] = options.announceList

    if options.comment?
      if options.comment is false
        delete result.comment
      else
        result.comment = options.comment

    # only allow custom name is it's multi file mode
    if options.name? and result.info.files?
      result.info.name = options.name

    if options.private?
      if options.private is false
        delete result.info.private
      else
        result.info.private = 1

    # source can be used to get a different info hash
    if options.source?
      if options.source is false
        delete result.info.source
      else
        result.info.source = options.source
    
    # update torrent date
    result['creation date'] = Math.round(Date.now() / 1000)

    # if output isn't provided, overwrite original file if local
    if options.output
      output = options.output
      if path.extname(output) isnt '.torrent'
        output += '.torrent'
    else if schema.isURL file
      output = path.basename file
    else
      output = file

    # write back to file
    data = b.encode result
    fs.writeFile output, data, 'binary', (err) ->
      callback err, output, result


# chech that hash of files in directory match files in torrents
# emits 'hash' event each time a hash is validated
# continues to check even if a hash failed in case
# torrent is partially downloaded
hashCheck = (torrent, dir, options = {}, callback) ->
  if typeof options is 'function'
    callback = options
    options = {}
  
  if options.maxMemory
    maxBytes = toBytes options.maxMemory

  # separate pieces
  pieces = []
  for i in [0...torrent.info.pieces.length / 20]
    pieces[i] = torrent.info.pieces.slice((i*20), ((i+1)*20))

  hashOptions =
    maxFiles : options.maxFiles
    maxBytes : maxBytes

  # check if this is single or multi file torrent
  files = torrent.info.files or [{
    path: [torrent.info.name],
    length: torrent.info.length
  }]

  # start hashing
  hash dir, files, torrent.info['piece length'], hashOptions,
    (err, hashEmitter, totalPieces, files) ->
      return callback err if err
      emitter = new EventEmitter()

      percentMatched = piecesMatched = 0
      hashEmitter.on 'hash',
        (index, hash, percent, file, position, length) ->
          # check that hash matches
          match = true
          for i in [0...20]
            if pieces[index][i] isnt hash[i]
              match = false
              break

          if match
            percentMatched = Math.round(++piecesMatched /
              totalPieces * 10000) / 100
            emitter.emit 'match', index, hash, percentMatched,
              file, position, length
          else
            emitter.emit 'matcherror', index, file, position, length

      hashEmitter.on 'error', (err) -> emitter.emit 'error', err
      hashEmitter.on 'end', -> emitter.emit 'end', percentMatched

      # return emitter
      callback null, emitter


module.exports =
  getInfoHash : schema.getInfoHash
  read        : read
  readFile    : readFile
  readURL     : readURL
  readRaw     : readRaw
  write       : write
  make        : make
  edit        : edit
  hashCheck   : hashCheck
