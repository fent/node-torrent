path           = require 'path'
fs             = require 'fs'
crypto         = require 'crypto'
{EventEmitter} = require 'events'
async          = require 'async'
Buffers        = require 'buffers'


# some defaults used when reading files
MAX_FILES_OPENED = 250
MAX_BYTES_ALLOCATED = 536870912 # 512 mb (1073741824 = 1GB)


# returns sha1 hash of buffer
sha1 = (buffer) ->
  crypto.createHash('sha1').update(buffer).digest()


# round number to variable decimal places
round = (num, dec) ->
  pow = Math.pow 10, dec
  Math.round(num * pow) / pow


# calculates piece hashes of file list
module.exports = (dir, list, pieceLength, options = {}, callback) ->
  if typeof options is 'function'
    callback = options
    options = {}

  # set defaults
  options.maxFiles ?= MAX_FILES_OPENED
  options.maxBytes ?= MAX_BYTES_ALLOCATED

  emitter = new EventEmitter()
  files = []
  filetasks = []
  pieces = []

  if not path.existsSync dir
    return callback new Error "#{dir} does not exist"

  # check if list passes contains objects or strings
  if typeof list[0] is 'string'
    fileFun = (file) ->
      if not path.existsSync path.join(dir, file)
        return callback new Error "#{file} does not exist"

      files.push
        length : length = fs.statSync(path.join(dir, file)).size
        path   : file.split '/'
      filetasks.push task =
        file      : file
        length    : length
        readtasks : []
      task
  else
    fileFun = (file) ->
      files.push file
      filetasks.push task =
        file      : file.path.join '/'
        length    : file.length
        readtasks : []
      task

  # variables to help calculate piece position
  totalSize = totalBytesRead = piece = offset = 0

  # first get file sizes
  for file, i in list
    task = fileFun file

    # add this file's length to total length
    totalSize += task.length

    # keep track of file position and start "reading"
    position = 0
    bytesLeft = task.length
    until 0 is bytesLeft
      # calculate how much will be read in this task
      length = Math.min(bytesLeft, pieceLength)
      length -= offset if length > offset
      bytesLeft -= length

      # create peace object
      if not pieces[piece]
        pieces.push
          buffer : null
          length : length
      else
        pieces[piece].length += length

      # make new readtask for this filetask
      task.readtasks.push
        # piece this task will write to
        piece        : piece
        # piece buffer offset to start writing at
        offset       : offset
        # amount of bytes to read from file and write to buffer
        length       : length
        # where to start reading in file
        position     : position

      # update bytes left to read
      totalBytesRead += length
      position += length

      # get piece this task will write to and its offset
      piece = Math.floor(totalBytesRead / pieceLength)
      offset = totalBytesRead % pieceLength


  # keep track of progress
  piecesHashed = 0

  # keep track of how many read tasks are running
  # and the memory used by them
  bytesAllocated = 0
  checkBytes = (workers, task) ->
    bytesAllocated + task.length < options.maxBytes

  # add optiosn to stop hashing
  emitter.stop = (err) ->
    emitter.err = err

  # access files asynchronously to calculate piece hashes
  filesqueue = async.queue (task, callback) ->
    return callback emitter.err if emitter.err

    # open file for reading
    fs.open path.join(dir, task.file), 'r', 0666, (err, fd) ->
      if err
        emitter.emit 'err', err
        return callback()
      emitter.emit 'open', task.file

      # create queue for memory usage
      readqueue = async.queue (task, callback) ->
        return callback emitter.err if emitter.err
        bytesAllocated += task.length

        # check if piece has been written to already
        # if not, make object for it
        if not pieces[task.piece].buffer
          pieces[task.piece].buffer = new Buffer pieces[task.piece].length

        # read file
        fs.read task.fd, pieces[task.piece].buffer, task.offset,
          task.length, task.position, (err, bytesRead, buffer) ->
            if err
              emitter.emit 'error', err
              return callback()

            # update amount of bytes written to buffer
            pieces[task.piece].length -= task.length

            # check if buffer is full, if it is, generate hash
            if pieces[task.piece].length is 0
              length = pieces[task.piece].buffer.length
              pieces[task.piece] = new Buffer(
                sha1(pieces[task.piece].buffer), 'binary')

              # emit hash event with piece info and progress
              percent = round(++piecesHashed / pieces.length * 100, 2)
              emitter.emit 'hash', task.piece, pieces[task.piece], percent,
                task.file, task.position, task.length
              bytesAllocated -= length

            callback()

      , checkBytes

      # close this file when queue finishes
      readqueue.drain = ->
        fs.close fd, (err) ->
          emitter.emit 'error', err if err
          emitter.emit 'close', task.file
        callback()

      # queue up tasks for reading file asynchronously
      for readtask in task.readtasks
        # add file/fd to task object to reference in worker
        readtask.file = file
        readtask.fd   = fd
        readqueue.push readtask
  , options.maxFiles

  # what to do when queue is finished
  filesqueue.drain = ->
    # join all the pieces
    buf = Buffers()
    for p in pieces
      buf.push p
    emitter.emit 'end', buf.toBuffer()

  # start queueing jobs
  for task in filetasks
    filesqueue.push task

  # return emitter, number of pieces and list of processed files
  callback null, emitter, piece + 1, files
