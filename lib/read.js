var fs      = require('fs');
var b       = require('bncode');
var request = require('request');
var _       = require('underscore');
var zlib    = require('zlib');
var stream  = require('stream');

var schema  = require('./schema');
var util    = require('./util');


/**
 * Read torrent data.
 *
 * @param {String|ReadableStream} file File where the torrent
 *   resides, can be local file, remote, or a readable stream.
 * @param {Object} reqOpts Optional request options if file is remote.
 * @param {Function(!Error, Torrent)} callback
 * @param {ReadableStream}
 */
exports.read = function(file, reqOpts, callback) {
  if (reqOpts == null) reqOpts = {};
  if (typeof reqOpts === 'function') callback = reqOpts;

  if (util.isReadableStream(file)) {
    return readStream(file, callback);

  } else if (util.isURL(file)) {
    return readURL(file, reqOpts, callback);

  } else {
    return readFile(file, callback);
  }
};


/**
 * Download torrent and read its data.
 *
 * @param {String} urladdr
 * @param {Object} reqOpts Optional request options.
 * @param {Function(!Error, Torrent)} callback
 * @param {ReadableStream}
 */
var readURL = exports.readURL = function(uri, options, callback) {
  if (options == null) options = {};
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  var reqOptions = {uri: uri};
  _.extend(reqOptions, options);

  var rs = request(reqOptions);

  
  /**
   * We will create an intermediate stream, which converts any data we
   * receive over the wire from `rs` is decoded (since it can be in
   * compressed form).
   */
  var decompressedStream = new stream.PassThrough()

  rs.on('response', function (response) {
      /**
       * As soon as we receive a HTTP response, we're going to do the
       * switch-a-roo of our bencodedStream -- if our data is encoded
       * using a compression algorithm we recognize, pipe the stream
       * through Zlib, otherwise just pipe the raw data.
       */
      switch (response.headers['content-encoding']) {
      case 'gzip':
          rs.pipe(zlib.createGunzip()).pipe(decompressedStream)
          break;

      case 'deflate':
          rs.pipe(zlib.createInflate()).pipe(decompressedStream)
          break;

      default:
          /**
           * Default scenario, pipe all the data (since it likely is
           * just raw bencoded data anyway).
           */
          rs.pipe(decompressedStream);
      }
  });

  /*
   * Note how we pass the decompressedStream here, even though there isn't a producer
   * on this stream yet. 
   */
  return readStream(decompressedStream, callback);
};


/**
 * Reads torrent from local file system.
 *
 * @param {String} file
 * @param {Function(!Error, Torrent)} callback
 * @param {ReadableStream}
 */
var readFile = exports.readFile = function(file, callback) {
  return readStream(fs.createReadStream(file), callback);
};


/**
 * Read torrent data from stream
 *
 * @param {ReadableStream} rs
 * @param {Function(!Error, Torrent} callback
 * @param {ReadableStream}
 */
var readStream = exports.readStream = function(rs, callback) {
  callback = callback || function() {};
  var decoder = new b.decoder();

  rs.on('error', callback);

  rs.on('data', function(data) {
    try {
      decoder.decode(data);
    } catch (err) {
      if (rs.hasOwnProperty('fd')) {
        fs.close(rs.fd);
      }
      callback(err);
    }
  });

  rs.on('end', function() {
    try {
      schema.validate(decoder.result()[0], callback);
    } catch (err) {
      rs.emit('error', err);
      callback(err);
    }
  });

  return rs;
};


/**
 * Read raw buffered bencoded data
 *
 * @param {String|Buffer} buf
 * @param {function(!Error, Torrent)} callback
 */
exports.readRaw = function(buf, callback) {
  try {
    schema.validate(b.decode(buf), callback);
  } catch (err) {
    callback(err);
  }
};
