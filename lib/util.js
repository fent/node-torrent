const urlRegexp = /^(http|udp|ftp|dht)s?:\/\//;

/**
 * Returns true if str is a URL.
 *
 * @param {string} str
 * @return {boolean}
 */
exports.isURL = str => urlRegexp.test(str);


/**
 * Returns true if n is an integer.
 *
 * @param {number} n
 * @return {boolean}
 */
exports.isInteger = n => !isNaN(parseInt(n, 10));


/**
 * Splits a path into an array, platform safe.
 *
 * @param {string} path
 * @return {Array.<string>}
 */
exports.splitPath = path => path.split(path.sep);


/**
 * Returns true if part of buffer `b` beginning at `start` matches buffer `a`.
 *
 * @param {Buffer} a
 * @param {Buffer} b
 * @param {number} start
 */
exports.buffersMatch = (a, b, start) => {
  for (let i = 0, l = b.length; i < l; i++) {
    if (a[start + i] !== b[i]) {
      return false;
    }
  }

  return true;
};
