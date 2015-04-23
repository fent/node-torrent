var crypto       = require('crypto');
var fs           = require('fs');
var b            = require('bncode');
var MemoryStream = require('memorystream');

var Hasher       = require('./hasher');
var buffersMatch = require('./util').buffersMatch;


/**
 * @constructor
 * @param {Object} metadata
 */
var Torrent = module.exports = function(metadata) {
  this.metadata = metadata;
};


/**
 * @return {String} Returns info hash of torrent
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
 * @return {ReadableStream}
 */
Torrent.prototype.createReadStream = function() {
  var memStream = new MemoryStream();
  memStream.readable = true;

  // Bencode data and emit it from readstream.
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
 * to a writable stream of a file, then return it.
 *
 * @param {String} path
 * @param {Object} options
 * @return {WritableStream}
 */
Torrent.prototype.createWriteStream = function(path, options) {
  var rs = this.createReadStream();
  var ws = fs.createWriteStream(path, options);
  rs.pipe(ws);
  return ws;
};


/**
 * Hash checks torrent.
 *
 * @param {String} dir Directory where files are.
 * @param {Object} options
 * @return {Hasher}
 */
Torrent.prototype.hashCheck = function(dir, options) {
  options = options || {};

  var info = this.metadata.info;

  // Check if this is a single or multi file mode torrent.
  var files = info.files || [{ path: [info.name], length: info.length }];

  // Call the hasher.
  var hashOptions = { maxFiles: options.maxFiles };
  var hasher = new Hasher(dir, files, info['piece length'], hashOptions);
  var percentMatched = 0;
  var piecesMatched = 0;
  var pieces = info.pieces.length / 20;

  hasher.on('hash', function(index, hash, file, position, length) {
    // Check that hash matches.
    if (buffersMatch(info.pieces, hash, index * 20)) {
      percentMatched = Math.round(++piecesMatched / pieces * 10000) / 100;
      hasher.emit('match', index, hash, percentMatched, file, position, length);
    } else {
      hasher.emit('matcherror', index, file, position, length);
    }
  });

  return hasher;
};
