var URL = /^((http|udp|ftp)s?:\/\/)?([a-zA-Z1-90-]{2,}\.)+?([a-zA-Z1-90-]{2,6})(:\d{2,})?(\/\S+)*$/;

/**
 * Returns true if str is a URL.
 *
 * @param (string) str
 * @return (boolean)
 */
exports.isURL = function(str) {
  return URL.test(str);
};


/**
 * Returns true if n is an integer.
 *
 * @param (number) n
 * @return (boolean)
 */
exports.isInteger = function(n) {
  return !isNaN(parseInt(n));
};


var SIZES = /((\d)+(\.\d+)?)(k|m|g|t)?b?/i
  , POWERS = {k: 10, m: 20, g: 30, t: 40}


/**
 * Returns bytes from human readable memory sizes such as 1.5MB
 *
 * @param (string|number) str
 * @return (number)
 */
exports.toBytes = function(str) {
  var result = SIZES.exec(str)
    , num    = parseFloat(result[1])
    , c      = result[4].toLowerCase()

  return POWERS[c] ? Math.round(num * (1 << POWERS[c])): num;
};


/**
 * Returns true if rs is a ReadableStream
 *
 * @param (stream.ReadableStream) rs
 * @return (boolean)
 */
var Stream = require('stream').Stream;
exports.isStream = function(rs) {
  return typeof rs === 'object' && rs instanceof Stream && rs.readable;
};

/**
 * Splits a path into an array, platform safe.
 *
 * @param (string) path
 * @return (Array.string)
 */
var isWindows = process.platform === 'win32';
var splitc    = isWindows ? '\\' : '/';
exports.splitPath = function(path) {
  return path.split(splitc);
};


/**
 * Deep clones an object keeping hash keys alphabetized.
 * Calls itself.
 *
 * @param (Object) obj
 * @return (Object)
 */
var clone = exports.clone = function(obj) {
  // Handle the 3 simple types, and null or undefined
  if (null == obj || 'object' != typeof obj) return obj;

  // Array
  else if (Array.isArray(obj) || Buffer.isBuffer(obj)) {
    copy = [];

    obj.forEach(function(el, i) {
      copy[i] = clone(el);
    });

    return copy;

  // Buffer
  } else if (Buffer.isBuffer(obj)) {
    return obj.slice();

  // hashes
  } else if (obj instanceof Object) {
    var copy = {}

    Object.keys(obj).sort().forEach(function(key) {
      copy[key] = clone(obj[key]);
    });

    return copy;

  } else {
    throw new Error('Unable to copy obj! Its type isn\'t supported.');
  }
};
