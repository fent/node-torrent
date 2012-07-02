var fs           = require('fs')
  , b            = require('bncode')
  , request      = require('request')
  , _            = require('underscore')

  , schema       = require('./schema')
  , util         = require('./util')


/**
 * Read torrent data
 *
 * @param (string|stream.ReadableStream) file File where the torrent
 *   resides, can be local file, remote, or a readable stream.
 * @param (Object) reqOpts Optional request options if file is remote.
 * @param (function(err, Torrent)) callback
 * @param (ReadableStream)
 */
var read = exports.read = function(file, reqOpts, callback) {
  if (reqOpts == null) reqOpts = {};
  if (typeof reqOpts === 'function') callback = reqOpts;

  if (util.isStream(file)) {
    return readStream(file, callback);

  } else if (util.isURL(file)) {
    return readURL(file, reqOpts, callback);

  } else {
    return readFile(file, callback);
  }
};


/**
 * Download torrent and read its data
 *
 * @param (string) urladdr
 * @param (Object) reqOpts Optional request options.
 * @param (function(err, Torrent)) callback
 * @param (ReadableStream)
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
  return readStream(rs, callback);
};


/**
 * Reads torrent from local file system
 *
 * @param (string) file
 * @param (function(err, Torrent) callback
 * @param (ReadableStream)
 */
var readFile = exports.readFile = function(file, callback) {
  return readStream(fs.createReadStream(file), callback);
};


/**
 * Read torrent data from stream
 *
 * @param (stream.ReadableStream) rs
 * @param (function(err, Torrent) callback
 * @param (ReadableStream)
 */
var readStream = exports.readStream = function(rs, callback) {
  callback = callback || function() {};
  var decoder = new b.decoder()

  rs.on('error', callback);

  rs.on('data', function(data) {
    try {
      decoder.decode(data);
    } catch (err) {
      fs.close(rs.fd);
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
 * @param (string|Buffer) buf
 * @param (function(err, Torrent)) callback
 */
var readRaw = exports.readRaw = function(buf, callback) {
  try {
    schema.validate(b.decode(buf), callback);
  } catch (err) {
    callback(err);
  }
};
