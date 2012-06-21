var fs           = require('fs')
  , path         = require('path')
  , b            = require('bncode')
  , MemoryStream = require('memorystream')
  , read         = require('./read').read
  , util         = require('./util')
  , schema       = require('./schema')

/**
 * Edits a torrent file and optionally writes it back.
 * Faster than hashing all the files again.
 *
 * @param (Object) torrent Can be a torrent object or a local/remote path
 *   or a readable stream.
 * @param (Object) options
 * @param (function(err, output, torrent)) callback
 * @return (ReadableStream)
 */
var edit = exports.edit = function(torrent, options, callback) {
  var memStream = new MemoryStream();
  memStream.readable = true;

  if (schema.checkTorrent(torrent) !== null) {
    torrent = util.clone(torrent);
    read(torrent, editTorrent(memStream, options, callback));
  } else {
    editTorrent(memStream, options, callback)(null, torrent);
  }

  return memStream;
};


function editTorrent(memStream, options, callback) {
  options = options || {};
  callback = callback || function() {};

  return function(err, torrent) {
    if (err) {
      memStream.emit('error', err);
      return callback(err);
    }

    if (options.announce) torrent.announce = options.announce;

    // check for optionals
    // announce list, comment, and source are optional
    if (options.announceList != null) {
      if (options.announceList === false) {
        delete torrent['announce-list'];
      } else {
        var msg = schema.announceList(options.announceList);
        if (msg) return callback(new Error(msg));
        torrent['announce-list'] = options.announceList;
      }
    }

    if (options.comment != null) {
      if (options.comment === false) {
        delete torrent.comment;
      } else {
        torrent.comment = options.comment;
      }
    }

    // only allow custom name if it's multi file mode
    if ((options.name != null) && (torrent.info.files != null)) {
      torrent.info.name = options.name;
    }

    if (options.private != null) {
      if (options.private === false) {
        delete torrent.info.private;
      } else {
        torrent.info.private = 1;
      }
    }

    // source can be used to geta different info hash
    if (options.source != null) {
      if (options.source === false) {
        delete torrent.info.source;
      } else {
        torrent.info.source = options.source;
      }
    }

    // update torrent date
    torrent['creation date'] = Math.round(Date.now() / 1000);

    // bencode data and emit it from readstream
    var data = b.encode(torrent);
    memStream.write(data, function() {
      memStream.emit('end', torrent);
      callback(null, torrent);
    });
  };
}


/**
 * Shortcut that pumps returned readable stream to a writable stream.
 *
 * @param (string) torrent
 * @param (string) output
 * @param (Object) options
 * @param (function(err, torrent)) callback
 */
exports.editWrite = function(torrent, output, options, callback) {
  var rs = edit(torrent, options, callback);
  rs.pipe(fs.createWriteStream(output));
  return rs;
};
