var urlRegexp = /^(http|udp|ftp|dht)s?:\/\//;

/**
 * Returns true if str is a URL.
 *
 * @param {String} str
 * @return {Boolean}
 */
exports.isURL = function(str) {
  return urlRegexp.test(str);
};


/**
 * Returns true if n is an integer.
 *
 * @param {Number} n
 * @return {Boolean}
 */
exports.isInteger = function(n) {
  return !isNaN(parseInt(n, 10));
};


var SIZES = /((\d)+(\.\d+)?)(k|m|g|t)?b?/i;
var POWERS = {k: 10, m: 20, g: 30, t: 40};


/**
 * Returns bytes from human readable memory sizes such as `1.5MB`.
 *
 * @param {String|Number} str
 * @return {Number}
 */
exports.toBytes = function(str) {
  var result = SIZES.exec(str);
  var num    = parseFloat(result[1]);
  var c      = result[4].toLowerCase();
  return POWERS[c] ? Math.round(num * (1 << POWERS[c])): num;
};


/**
 * Returns true if rs is a ReadableStream.
 *
 * @param {ReadableStream} rs
 * @return {Boolean}
 */
exports.isReadableStream = function(rs) {
  return typeof rs === 'object' && typeof rs.pipe === 'function' &&
    typeof rs.readable === 'boolean' && rs.readable;
};

/**
 * Splits a path into an array, platform safe.
 *
 * @param {String} path
 * @return {Array.<String>}
 */
var isWindows = process.platform === 'win32';
var splitc    = isWindows ? '\\' : '/';
exports.splitPath = function(path) {
  return path.split(splitc);
};


/**
 * Returns true if part of buffer `b` beginning at `start` matches buffer `a`.
 *
 * @param {Buffer} a
 * @param {Buffer} b
 * @param {Number} start
 */
exports.buffersMatch = function(a, b, start) {
  for (var i = 0, l = b.length; i < l; i++) {
    if (a[start + i] !== b[i]) {
      return false;
    }
  }

  return true;
};
