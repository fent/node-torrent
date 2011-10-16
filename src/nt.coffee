# cli file

options = require('nomnom')()
  .usage('''
  Usage: nt <action> [options] <files>...

  actions:
    make   - Make a torrent
    edit   - Read a torrent, edit its metainfo variables, and write it
             Can't change its files
    hash   - Returns info hash from a torrent
    check  - Hash checks torrent file
             If no folder is specified, will use cwd

  options:
    -a, --announce URL              Announce URL. At least one is required
    -c, --comment COMMENT           Add a comment to the metainfo
    -n, --name NAME                 Name of torrent
    -l, --piece-length INT          Set piece to 2^n bytes. Default: 256KB
    -p, --private                   Make this a private torrent
    -s, --source STR                Add source to metainfo
    -o, --output FILE               Where to write output file
    -f, --max-files INT             Max simultaneous files to open
    -m, --max-memory STR            Max amount of memory to allocate
    --folder FOLDER                 Folder to hash check

  ''')
  .opts(
    announceList:
      abbr: 'a'
      full: 'announce'
      list: true
    comment:
      abbr: 'c'
      full: 'comment'
    name:
      abbr: 'n'
      full: 'name'
    pieceLength:
      abbr: 'l'
      full: 'piece-length'
    private:
      abbr: 'p'
      full: 'private'
      flag: true
    source:
      abbr: 's'
      full: 'source'
    output:
      abbr: 'o'
      full: 'output'
    maxFiles:
      abbr: 'f'
      full: 'max-files'
    maxMemory:
      abbr: 'm'
      full: 'max-memory'
    folder:
      full: 'folder'
    action:
      position: 0
      required: true
      choices: ['make', 'edit', 'hash', 'check']
    files:
      position: 1
      required: true
      list: true
  ).parseArgs()


# dependencies
fs      = require 'fs'
path    = require 'path'
async   = require 'async'
findit  = require 'findit'
colors  = require 'colors'
nt      = require './torrent'


BAR   = '♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥'
NOBAR = '♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡'
CLEAR = '                                                  '
progress = (percent) ->
  rounded = Math.round(percent / 2)

  # pad percent
  percent = percent.toFixed 2
  percent = CLEAR.substr(0, 6 - percent.length) + percent

  # print progress bar
  process.stdout.write ' ['.grey + BAR.substr(0, rounded).bold.green + NOBAR.substr(0, 50 - rounded) + '] '.grey + percent.bold.cyan + '%'.grey + '\r'

logerr = (err) ->
  process.stderr.write 'Error: '.bold.red + (err.message or err) + '\n'
  process.exit 1

removeForwardSlash = (path) ->
  if path.charAt(path.length - 1) is '/'
    path.substr(0, path.length - 1)
  else
    path

getAnnounce = (options) ->
  if not options.announceList
    return null
  if options.announceList.length > 1
    announce = options.announceList.shift()
    announceList = []
    for url in options.announceList
      announceList.push [url]
    options.announceList = announceList
  else
    announce = options.announceList[0]
    delete options.announceList
  announce


switch options.action
  when 'make'
    # check announce list is not empty
    if not options.announceList
      logerr 'Must provide at least one announce URL'

    dir = './'
    folder = null
    removeFolder = (path) -> path

    # check if there was only one folder passed in
    if options.files.length is 1
      f = (callback) ->
        fs.stat options.files[0], (err, stats) ->
          return callback err if err
          if stats.isDirectory()
            dir = options.files[0]
            folder = removeForwardSlash options.files[0]
            removeFolder = (path) -> path.split('/').slice(1).join('/')
          callback()
    else
      f = (callback) -> callback()

    # traverse files given and any files in folders recursively
    funs = [f]
    for file in options.files
      do (file) ->
        funs.push (callback) ->
          if not path.existsSync file
            return callback new Error "#{file} does not exist"

          files = []
          file = removeForwardSlash path.normalize file
          emitter = findit.find file
          emitter.on 'file', (file) -> files.push removeFolder file
          emitter.on 'end', -> callback null, files

    # traverse files asynchronously
    async.parallel funs, (err, results) ->
      return logerr err if err

      # results is an array of array of files
      # the first element is null too so remove it
      options.files = []
      results = results.slice 1
      for r in results
        options.files = options.files.concat r
      if options.files.length is 0
        return logerr 'No files to add'

      # set output filename
      filename = options.output or options.name or folder or options.files[0]
      if path.extname(filename) isnt '.torrent'
        filename += '.torrent'

      # check if more than one announce URL was provided
      announce = getAnnounce options

      nt.write filename, announce, dir, options.files, options,
        (err, emitter) ->
          return logerr err if err

          console.time 'Time taken'
          emitter.on 'error', (err) -> logerr err
          emitter.on 'progress', (percent) -> progress percent

          emitter.on 'end', ->
            console.log "\nFinished writing torrent at #{filename.bold}"
            console.timeEnd 'Time taken'

          # listen for ctrl+c
          process.on 'SIGINT', ->
            emitter.stop()
            process.stdout.write '\n'
            process.exit 1

  when 'edit'
    options.announce = getAnnounce options
    nt.edit options.files[0], options, (err, output) ->
      logerr if err
      console.log "File written to #{output.bold}"

  when 'hash'
    nt.readFile options.files[0], (err, result) ->
      logerr err if err
      console.log nt.getInfoHash(result)

  when 'check'
    nt.readFile options.files[0], (err, result) ->
      logerr err if err
      nt.hashCheck result, options.folder or './', options,
        (err, emitter) ->
          logerr err if err

          console.time 'Time taken'
          emitter.on 'error', (err) -> logerr err
          emitter.on 'match', (index, hash, percent) -> progress percent

          emitter.on 'end', ->
            console.log "\nFinished hash checking torrent"
            console.timeEnd 'Time taken'

          # listen for ctrl+c
          process.on 'SIGINT', ->
            emitter.stop()
            process.stdout.write '\n'
            process.exit 1
