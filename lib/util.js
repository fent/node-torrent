var URL = /^((http|udp|ftp)s?:\/\/)?([a-zA-Z1-90\-]{2,}\.)+?([a-zA-Z1-90\-]{2,6})(:\d{2,})?(\/\S+)*$/;

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
  return !isNaN(parseInt(n, 10));
};


var SIZES = /((\d)+(\.\d+)?)(k|m|g|t)?b?/i
  , POWERS = {k: 10, m: 20, g: 30, t: 40}
  ;


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
    ;

  return POWERS[c] ? Math.round(num * (1 << POWERS[c])): num;
};


/**
 * Returns true if rs is a ReadableStream
 *
 * @param (stream.ReadableStream) rs
 * @return (boolean)
 */
exports.isReadableStream = function(rs) {
  return typeof rs === 'object' && typeof rs.pipe === 'function'
    && typeof rs.readable === 'boolean' && rs.readable;
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
 * Returns true if part of buffer `b` beginning at `start` matches buffer `a`
 *
 * @param (Buffer) a
 * @param (Buffer) b
 * @param (number) start
 */
exports.buffersMatch = function(a, b, start) {
  for (var i = 0, l = b.length; i < l; i++) {
    if (a[start + i] !== b[i]) {
      return false;
    }
  }

  return true;
};
