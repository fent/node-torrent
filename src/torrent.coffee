fs             = require 'fs'
path           = require 'path'
crypto         = require 'crypto'
{EventEmitter} = require 'events'
request        = require 'request'
b              = require 'bencode'
hash           = require './hash'

APP_NAME = 'node-torrent'
VERSION  = 'v0.1.0'


# returns true if str is a url
URL = /^((http|udp)s?:\/\/)?(www\.)?([a-zA-Z1-90-]{2,}\.)+?([a-zA-Z-]{2,6})(:\d{2,})?(\/\S+)*$/
isURL = (str) ->
  URL.test str


# returns bytes from human readable memory sizes such as 1.5MB
SIZES = /((\d)+(\.\d+)?)(m|g|t)?b?/i
POWERS = { k: 10, m: 20, g: 30 }
toBytes = (str) ->
  result = SIZES.exec str
  num = parseFloat result[1]
  c = result[4].toLowerCase()
  if POWERS[c]
    Math.round num * (1 << POWERS[c])
  else
    num


module.exports =
  # gets info hash of torrent object
  getInfoHash: (torrent) ->
    crypto.createHash('sha1').update(b.encode(torrent.info))
      .digest('hex').toUpperCase()


  # read torrent data
  read: (file, requestOptions = {}, callback) ->
    if typeof requestOptions is 'function'
      callback = requestOptions

    # check if file is url
    if isURL file
      @readURL file, requestOptions, callback

    # check if file exists in case it's a path
    else if path.existsSync file
      @readFile file, callback
    
    else
      callback new Error 'Not a URL or file does not exists'

  # download torrent and read its data
  readURL: (url, requestOptions, callback) ->
    if typeof requestOptions is 'function'
      callback = requestOptions
    else
      requestOptions.url = url
      requestOptions.encoding = 'binary'

    request requestOptions, (err, res, body) =>
      return callback err if err
      @readRaw body, callback


  # reads torrent from local file system
  readFile: (file, callback) ->
    fs.readFile file, 'binary', (err, data) =>
      return callback err if err
      @readRaw data, callback


  # read raw data
  readRaw: (rawdata, callback) ->
    try
      result = b.decode rawdata
      hash = @getInfoHash result
      callback null, hash, result, rawdata

    # there might be an error decoding
    catch err
      callback err


  # makes torrent file
  # options =
  #   announceList: [[]]
  #   comment: ''
  #   name: used in multifile mode
  #   pieceLength: power of 2
  #   private: 1
  #   source: '' put in info to generate different info hash
  #   maxFiles: 500 # max files to open at the same time
  #   maxMemory: 512MB
  make: (announce, dir, files, options = {}, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}

    # check announce url
    if not isURL announce
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
          if not isURL url
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
          info.name   = files[0].path.join '/'
          info.length = files[0].length
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
  write: (filename, announce, dir, files, options = {}, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}
    options.name ?= path.basename filename, '.torrent'

    # open file for writing
    fs.open filename, 'w', 0666, (err, fd) =>
      return callback err if err

      @make announce, dir, files, options,
        (err, emitter, pieces, torrent) ->
          return callback err if err

          # generate fake pieces to encode it
          piecesLength = 20 * pieces
          torrent.info.pieces = new Buffer(piecesLength).toString()

          # bencode data
          data = new Buffer b.encode(torrent), 'binary'
          strData = data.toString()
          dict = "6:pieces#{piecesLength}:"
          piecesPosition = strData.indexOf(dict) + dict.length
          piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition))

          # start writing to file
          fs.write fd, data, 0, data.length, 0, (err) ->
            emitter.emit 'error', err if err

          # listen for hash events
          emitter.on 'hash', (index, hash, percent) ->
            # write to file piece by piece
            position = piecesPosition + index * 20
            fs.write fd, new Buffer(hash, 'binary'), 0, 20, position,
              (err) -> emitter.emit 'error', err if err
            emitter.emit 'progress', percent

          emitter.on 'error', (err) ->
            #fs.close fd
            emitter.stop err

          # wait until torrent object is finished being made
          emitter.on 'end', ->
            fs.close fd, (err) ->
              emitter.emit 'error', err if err

          # return emitter
          callback null, emitter


  # chech that hash of files in directory match files in torrents
  # emits 'hash' event each time a hash is validated
  # continues to check even if a hash failed in case
  # torrent is partially downloaded
  hashCheck: (info, dir, options = {}, callback) ->
    if typeof options is 'function'
      callback = options
      options = {}
    
    if options.maxMemory
      maxBytes = toBytes options.maxMemory

    # separate pieces
    pieces = info.pieces.match(/[\s\S]{20}/g)

    hashOptions =
      maxFiles : options.maxFiles
      maxBytes : maxBytes

    # start hashing
    hash dir, info.files, info['piece length'], hashOptions,
      (err, emitter, totalPieces, files) ->
        return callback err if err

        percentMatched = piecesMatched = 0
        emitter.on 'hash', (index, hash, percent, file, position, length) ->
          # check that hash matches
          if pieces[index] is hash
            percentMatched = Math.round(++piecesMatched / pieces * 1000) /
              1000
            emitter.emit 'match', index, hash, percentMatched,
              file, position, length
          else
            emitter.emit 'error', new Error "Piece #{index} does not match"

        # return emitter
        callback null, emitter
