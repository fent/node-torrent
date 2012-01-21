var fs             = require('fs')
  , path           = require('path')
  , MemoryStream   = require('memorystream')
  , OrderedEmitter = require('ordered-emitter')
  , b              = require('bncode')
  , Buffers        = require('buffers')

  , Hasher         = require('./hasher')
  , util           = require('./util')

  
  // used to display program info when creating torrents
  // and with the cli
  , pkg          = JSON.parse(
      fs.readFileSync(__dirname + '/../package.json'))
  , APP_NAME     = pkg.name
  , APP_VERSION  = pkg.version


/**
 * Makes torrent file object
 * @param (string) announce The announce URL
 * @param (string) dir Directory where the files in the files array are
 * @param (Array.string) files Optional
 * @param options Any opptions for the torrent go here
 * @param options.announceList
 * @param options.comment
 * @param options.name Used in multifile mode. If not present, folder
 *   name will be used.
 * @param options.pieceLength A power of 2 representing the byte length
 *   of each piece.
 * @param options.private
 * @param options.source Typically used to generate a different info hash.
 * @param options.maxFiles Max files to open at the same time when hashing.
 * @param options.maxMemory Max amount of memory to allocate when hashing.
 *   Can be bytes or in human readable form such as 300.50MB
 * @param (function(err, torrent)) callback
 * @return (ReadStream)
 */
var make = exports.make = function(announce, dir, files,
                                   options, callback) {
  // first handle all of the optional arguments
  var typeofFiles = typeof files
    , typeofOptions = typeof options
    , typeofCallback = typeof callback

  if (typeofFiles === 'function') {
    callback = files;
    options = {};
    files = ['.'];

  } else if (typeofFiles === 'object' && !Array.isArray(files)) {
    callback = typeofOptions === 'function' ? options : function() {};
    options = files;
    files = ['.'];

  } else {
    if (typeofOptions === 'function') {
      callback = options;
      options = {};

    } else {
      callback = callback || function() {};
      options = options || {};
    }

    if (typeofFiles === 'string') files = [files];
    else if (typeofFiles === 'undefined') files = ['.'];
  }


  var memStream = new MemoryStream()
    , order     = new OrderedEmitter()
    , buf       = Buffers();

  memStream.readable = true;

  // check announce URL
  if (!util.isURL(announce)) {
    var err = new Error("Not a URL: " + announce);
    memStream.emit('error', err);
    return callback(err);
  }

  // take care of default options
  if (options.maxMemory) var maxBytes = toBytes(options.maxMemory);

  // make torrent info object
  var info = {}
    , pieceLength = options.pieceLength
        ? 1 << options.pieceLength
        // defaault piece length is 256kb
        : 262144

  // check list of files is not empty
  if (files.length === 0) {
    var err = new Error('no files given');
    memStream.emit('error', err);
    return callback(err);
  }

  // make main torrent object
  var torrent = {};
  torrent.announce = announce;

  // check and validate announce list
  if (options.announceList != null) {
    var msg = schema.announceList(options.announceList);
    if (msg !== null) {
      var err = new Error(msg);
      memStream.emit('error', err);
      return callback(err);
    }
    torrent['announce-list'] = options.announceList;
  }

  // check comment options
  if (options.comment != null) torrent.comment = options.comment;

  torrent['created by'] = "" + APP_NAME + " " + APP_VERSION;
  torrent['creation date'] = Math.round(Date.now() / 1000);
  torrent.info = info;

  // start hashing files
  var hashOptions = {
    maxFiles: options.maxFiles
  , maxBytes: maxBytes
  , stopOnErr: true
  };

  var hasher = new Hasher(dir, files, pieceLength, hashOptions);

  hasher.on('ready', function() {

    // multi file mode
    if (hasher.files.length > 1) {
      info.files = hasher.files;
      info.name = options.name || path.basename(dir);

    // single file mode
    } else {
      info.length = hasher.files[0].length;
      info.name = path.join.apply(null, hasher.files[0].path);
    }

    info['piece length'] = pieceLength;
    info.pieces = null;
    if (options.private) info.private = 1;
    if (options.source) info.source = options.source;

    // generate fake pieces to encode them
    var piecesLength = 20 * hasher.pieces;
    torrent.info.pieces = new Buffer(piecesLength);

    // bencode data
    var data       = new Buffer(b.encode(torrent), 'binary')
      , strData    = data.toString()
      , dict       = '6:pieces' + torrent.info.pieces.length + ':'
      , piecesPosition = strData.indexOf(dict) + dict.length
    piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition));

    // write first part of torrent to stream
    process.nextTick(function() {
      memStream.write(data.slice(0, piecesPosition));
    });

    // write last part when hashing is finished
    hasher.on('end', function() {
      info.pieces = buf.toBuffer();

      memStream.write(data.slice(piecesPosition + piecesLength),
                     function() {
        memStream.emit('end', torrent);
        callback(null, torrent);
      });
    });
  });


  // listen for hash events
  hasher.on('hash', function(index, hash, percent) {
    order.emit('hash', {order: index, hash: hash});
  });

  hasher.on('progress', function(percent) {
    memStream.emit('progress', percent);
  });

  // emit events to memStream in correct order
  order.on('hash', function(obj) {
    buf.push(obj.hash);
    memStream.write(obj.hash);
  });


  // handle stream errors
  hasher.on('error', function(err) {
    memStream.emit('error', err);
    callback(err);
  });


  // proxy a few memStream functions to the hasher
  ['pause', 'resume', 'destroy'].forEach(function(fn) {
    var old = memStream[fn];
    memStream[fn] = function() {
      hasher[fn]();
      return old.call(memStream);
    };
  });

  return memStream;
};


/**
 * Calls make and creates a write stream with the returned read stream.
 * @param (string) output
 * @param (string) announce
 * @param (string) dir
 * @param (Array.string) files
 * @param (Object) options
 * @param (function(err, torrent)) callback
 * @return (ReadStream)
 */
exports.makeWrite = function(output, announce, dir, files,
                               options, callback) {
  var rs = make(announce, dir, files, options, callback);
  rs.pipe(fs.createWriteStream(output));
  return rs;
};
