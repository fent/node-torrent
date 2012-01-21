var Hasher       = require('./hasher')


/**
 * Checks if buffer a matches buffer b
 * @param (Buffer) a
 * @param (Buffer) b
 * @return (boolean)
 */
function buffersMatch(a, b) {
  for (var i = 0, l = a.length; i < l; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
};


/**
 * Check that hash of files in directory match files in torrent.
 * Emits `hash` events each time a hash is validated.
 * Continues to check even if a hash failed in case the torrent is
 * partially downloaded.
 * @param (Object) torrent
 *   or readable stream.
 * @param (string) dir Directory where files are.
 * @param (Object) options
 * @return (EventEmitter)
 */
module.exports = function(torrent, dir, options) {
  options = options || {};
  if (options.maxMemory) var maxBytes = toBytes(options.maxMemory);

  var hashOptions = {
    maxFiles: options.maxFiles,
    maxBytes: maxBytes
  };


  // separate pieces buffer
  var pieces = [];
  for (var i = 0, l = torrent.info.pieces.length / 20; i < l; i++) {
    pieces[i] = torrent.info.pieces.slice(i * 20, (i + 1) * 20);
  }
  
  // check if this is a single or multi file mode torrent
  var files = torrent.info.files || [{
        path   : [torrent.info.name]
      , length : torrent.info.length
    }];

  // call the hasher
  var hasher         = new Hasher(dir, files, torrent.info['piece length'],
                                  hashOptions)
    , percentMatched = 0
    , piecesMatched  = 0

  hasher.on('hash',
                 function(index, hash, file, position, length) {
    // check that hash matches
    if (buffersMatch(pieces[index], hash)) {
      percentMatched = Math.round(++piecesMatched /
                                  pieces.length * 10000) / 100;
      hasher.emit('match', index, hash, percentMatched,
                   file, position, length);
    } else {
      hasher.emit('matcherror', index, file, position, length);
    }
  });

  return hasher;
};
