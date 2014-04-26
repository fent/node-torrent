var fs       = require('fs');
var BStream  = require('bncode').Stream;
var streamin = require('streamin');

var schema  = require('./schema');


/**
 * Read torrent data.
 *
 * @param {String|ReadableStream} file File where the torrent
 *   resides, can be local file, remote, or a readable stream.
 * @param {Object} reqOpts Optional request options if file is remote.
 * @param {Function(!Error, Torrent)} callback
 * @param {ReadableStream}
 */
module.exports = function read(file, reqOpts, callback) {
  if (typeof reqOpts === 'function') {
    callback = reqOpts;
  } else if (!callback) {
    callback = function() {};
  }
  var rs = streamin(file, reqOpts);
  var bstream = new BStream();
  rs.pipe(bstream);

  bstream.on('error', function(err) {
    if (rs.hasOwnProperty('fd')) {
      fs.close(rs.fd);
    }
    callback(err);
  });

  bstream.on('data', function(result) {
    schema.validate(result, callback);
  });

  return rs;
};
