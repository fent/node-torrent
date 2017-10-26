const fs       = require('fs');
const BStream  = require('bncode').Stream;
const streamin = require('streamin');

const schema  = require('./schema');


/**
 * Read torrent data.
 *
 * @param {String|ReadableStream} file File where the torrent
 *   resides, can be local file, remote, or a readable stream.
 * @param {Object} reqOpts Optional request options if file is remote.
 * @param {Function(!Error, Torrent)} callback
 * @param {ReadableStream}
 */
module.exports = (file, reqOpts, callback) => {
  if (typeof reqOpts === 'function') {
    callback = reqOpts;
  } else if (!callback) {
    callback = () => {};
  }
  var rs = streamin(file, reqOpts);
  var bstream = new BStream();
  rs.pipe(bstream);

  bstream.on('error', (err) => {
    if (rs.hasOwnProperty('fd')) {
      fs.close(rs.fd);
    }
    callback(err);
  });

  bstream.on('data', (result) => {
    schema.validate(result, callback);
  });

  return rs;
};
