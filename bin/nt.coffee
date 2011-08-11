#!/usr/bin/env node

console.time 'time taken'
fs     = require 'fs'
path   = require 'path'
nt     = require '../lib/torrent'
async  = require 'async'
findit = require 'findit'
argv   = require('optimist')
  .usage('nt [options] (file or directory...)+')
  .wrap(78)
  .demand([1, 'a'])
  .alias('a', 'announce')
  .describe('a', 'announce URL')
  .alias('c', 'comment')
  .describe('c', 'add comment to metainfo')
  .alias('n', 'name')
  .describe('n', 'name of torrent')
  .alias('l', 'piece-length')
  .describe('l', 'set piece to 2^n bytes. default is 256KB')
  .alias('p', 'private')
  .describe('p', 'make this a private torrent')
  .alias('s', 'source')
  .describe('s', '''
  add source to metainfo
  useful to generate a different info hash
  ''')
  .alias('o', 'output')
  .describe('o', 'where to write output file')
  .alias('f', 'max-files')
  .describe('f', 'max amount of files to open during hashing')
  .alias('m', 'max-memory')
  .describe('m', '''
  max amount of memory to allocate while hashing
  can be a string that matches (\d)+(\.\d+)?(m|g|t)?b?
  default is 512MB
  ''')
  .boolean('p')
  .argv


CLEAR = '                                                  '
logerr = (err) ->
  throw err
  console.log 'Error: ' + if typeof err is 'string' then err else err.message

removeForwardSlash = (path) ->
  if path.charAt(path.length - 1) is '/'
    path.substr(0, path.length - 1)
  else
    path

basename = (file) ->
  ext = path.extname file
  file.substr 0, file.length - ext.length

# check if there was only one folder passed in
dir = './'
folder = null
removeFolder = (path) -> path
if argv._.length is 1
  f = (callback) ->
    fs.stat argv._[0], (err, stats) ->
      return callback err if err
      if stats.isDirectory()
        dir = argv._[0]
        folder = removeForwardSlash argv._[0]
        removeFolder = (path) -> path.split('/').slice(1).join('/')
      callback()
else
  f = (callback) -> './'


funs = [f]
for file in argv._
  do (file) ->
    funs.push (callback) ->
      if not path.existsSync file
        return callback new Error "#{file} does not exist"

      files = []
      file = removeForwardSlash path.normalize file
      emitter = findit.find file
      emitter.on 'file', (file) -> files.push removeFolder file
      emitter.on 'end', -> callback null, files

async.parallel funs, (err, results) ->
  return logerr err if err
  files = []
  results = results.slice 1
  for r in results
    files = files.concat r
  if files.length is 0
    return logerr 'no files to add'

  filename = argv.output or argv.name or folder or basename files[0]
  if path.extname(filename) isnt 'torrent'
    filename += '.torrent'

  # check if more than one announce URL was provided
  if Array.isArray argv.announce
    announce = argv.announce.shift()
    announceList = []
    for url in argv.announce
      announceList.push [url]
  else
    announce = argv.announce

  # make options object
  options =
    announceList : announceList
    comment      : argv.comment
    name         : argv.name
    pieceLength  : argv['piece-length']
    private      : argv.private
    source       : argv.source
    maxFiles     : argv['max-files']
    maxMemory    : argv['max-memory']

  nt.write filename, announce, dir, files, options, (err, emitter) ->
    return logerr if err
    emitter.on 'error', (err) -> throw err
    emitter.on 'progress', (percent) ->
      # pad percent
      percentStr = percent.toFixed 2
      while percentStr.length < 6
        percentStr = ' ' + percentStr

      # print progress bar
      rounded = Math.round(percent / 2)
      bar = ''
      for i in [0..rounded]
        bar += '='
      process.stdout.write " [#{(bar + '>').substr(0, 50)}#{CLEAR.substr(0, 49 - bar.length)}] #{percentStr}%\r"

      # check for end here because end get's emitted before percentage
      # reaches 100
      if percent is 100
        console.log "\nfinished writing torrent at #{filename}"
        console.timeEnd 'time taken'

    process.on 'SIGINT', ->
      emitter.stop()
      process.stdout.write '\n'
      process.exit 1
