var crypto = require('crypto')
  , b      = require('bncode')

/**
 * Gets info hash of a torrent object
 * @param (Object) torrent
 * @return (string)
 */
module.exports = function(torrent) {
  return crypto
    .createHash('sha1')
    .update(b.encode(torrent.info))
    .digest('hex');
};
