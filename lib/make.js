var fs             = require('fs')
  , path           = require('path')
  , OrderedEmitter = require('ordered-emitter')
  , b              = require('bncode')
  , Buffers        = require('buffers')

  , Hasher         = require('./hasher')
  , util           = require('./util')
  , Torrent        = require('./torrent')

  
  // used to display program info when creating torrents
  // and with the cli
  , pkg          = JSON.parse(
      fs.readFileSync(__dirname + '/../package.json'))
  , APP_NAME     = pkg.name
  , APP_VERSION  = pkg.version


/**
 * Makes torrent file object
 *
 * @param (string) announce The announce URL
 * @param (string) dir Directory where the files in the files array are
 * @param (Array.string) files Optional
 * @param options Any options for the torrent go here
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
 * @param (function(err, Torrent)) callback
 * @return (Hasher)
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


  var hashOptions = {
    maxFiles: options.maxFiles
  , stopOnErr: true
  };

  // defaault piece length is 256kb
  var pieceLength = options.pieceLength
        ? (1 << options.pieceLength) : 262144;

  // start hashing files
  var hasher      = new Hasher(dir, files, pieceLength, hashOptions)
    , order       = new OrderedEmitter()
    , buf         = Buffers()
    , info        = {}
    , data
    , piecesLength
    , piecesPosition
    ;

  hasher.readable = true;

  // check announce URL
  if (!util.isURL(announce)) {
    var err = new Error('Not a URL: ' + announce);
    process.nextTick(function() {
      hasher.destroy();
      hasher.emit('error', err);
      callback(err);
    });
    return;
  }

  // check list of files is not empty
  if (files.length === 0) {
    var err = new Error('no files given');
    process.nextTick(function() {
      hasher.destroy();
      hasher.emit('error', err);
      callback(err);
    });
    return;
  }

  // make metadata object
  var metadata = {};
  metadata.announce = announce;

  // check and validate announce list
  if (options.announceList != null) {
    var msg = schema.announceList(options.announceList);
    if (msg !== null) {
      var err = new Error(msg);
      process.nextTick(function() {
        hasher.destroy();
        hasher.emit('error', err);
        callback(err);
      });
      return;
    }
    metadata['announce-list'] = options.announceList;
  }

  // check comment options
  if (options.comment != null) metadata.comment = options.comment;

  metadata['created by'] = APP_NAME + ' ' + APP_VERSION;
  metadata['creation date'] = Math.round(Date.now() / 1000);
  metadata.info = info;


  // wait until hasher finishes examining file lengths
  hasher.on('ready', function() {

    // multi file mode
    if (options.multimode || hasher.files.length > 1) {
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
    piecesLength = 20 * hasher.pieces;
    info.pieces = new Buffer(piecesLength);

    // bencode data
    data = new Buffer(b.encode(metadata), 'binary')
    var strData = data.toString();
    var dict = '6:pieces' + piecesLength + ':';
    piecesPosition = strData.indexOf(dict) + dict.length
    piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition));

    // write first part of torrent to stream
    process.nextTick(function() {
      hasher.emit('data', data.slice(0, piecesPosition));
    });
  });


  // write last part when hashing is finished
  hasher.on('end', function() {
    info.pieces = buf.toBuffer();

    // note that listeners to this `data` event will be called before
    // listeners to the `end` event since its emitted inside this listener
    hasher.emit('data', data.slice(piecesPosition + piecesLength));
    callback(null, new Torrent(metadata));
  });


  // listen for hash events
  hasher.on('hash', function(index, hash, percent) {
    order.emit('hash', { order: index, hash: hash });
  });

  // emit hash events to memStream in correct order
  order.on('hash', function(obj) {
    buf.push(obj.hash);
    hasher.emit('data', obj.hash);
  });


  // handle stream errors
  hasher.on('error', function(err) {
    callback(err);
  });

  return hasher;
};


/**
 * Calls make and creates a write stream with the returned read stream.
 *
 * @param (string) output
 * @param (string) announce
 * @param (string) dir
 * @param (Array.string) files
 * @param (Object) options
 * @param (function(err, Torrent)) callback
 * @return (Hasher)
 */
exports.makeWrite = function(output, announce, dir, files, options, callback) {
  var rs = make(announce, dir, files, options, callback);
  rs.pipe(fs.createWriteStream(output));
  return rs;
};
