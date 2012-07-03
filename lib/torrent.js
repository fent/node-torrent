var crypto       = require('crypto')
  , fs           = require('fs')
  , b            = require('bncode')
  , MemoryStream = require('memorystream')
  , Hasher       = require('./hasher')
  , buffersMatch = require('./util').buffersMatch
  ;


/**
 * @constructor
 * @param (Object) metadata
 */
var Torrent = module.exports = function(metadata) {
  this.metadata = metadata;
};


/**
 * @return (string) Returns info hash of torrent
 */
Torrent.prototype.infoHash = function() {
  return crypto
    .createHash('sha1')
    .update(b.encode(this.metadata.info))
    .digest('hex')
    ;
};


/**
 * Creates a readable stream that emits raw torrent data.
 *
 * @return (ReadableStream)
 */
Torrent.prototype.createReadStream = function() {
  var memStream = new MemoryStream;
  memStream.readable = true;

  // bencode data and emit it from readstream
  var data = b.encode(this.metadata);

  process.nextTick(function() {
    memStream.write(data, function() {
      memStream.emit('end');
    });
  });

  return memStream;
};


/**
 * Shortcut to pipe the readable stream created by Torrent#createReadStream
 * to a writable stream of a file.
 *
 * @param (string) path
 * @param (Object) options
 * @return (ReadableStream)
 */
Torrent.prototype.createWriteStream = function(path, options) {
  var rs = this.createReadStream();
  rs.pipe(fs.createWriteStream(path, options));
  return rs;
};


/**
 * Hash checks torrent.
 *
 * @param (string) dir Directory where files are.
 * @param (Object) options
 * @return (Hasher)
 */
Torrent.prototype.hashCheck = function(dir, options) {
  options = options || {};

  var info = this.metadata.info

    // check if this is a single or multi file mode torrent
    , files = info.files || [{ path: [info.name], length: info.length }]

    // call the hasher
    , hashOptions = { maxFiles: options.maxFiles }
    , hasher = new Hasher(dir, files, info['piece length'], hashOptions)
    , percentMatched = 0
    , piecesMatched = 0
    , pieces = info.pieces.length / 20
    ;

  hasher.on('hash', function(index, hash, file, position, length) {
    // check that hash matches
    if (buffersMatch(info.pieces, hash, index * 20)) {
      percentMatched = Math.round(++piecesMatched / pieces * 10000) / 100;
      hasher.emit('match', index, hash, percentMatched, file, position, length);
    } else {
      hasher.emit('matcherror', index, file, position, length);
    }
  });

  return hasher;
};
