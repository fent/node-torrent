const util    = require('./util');
const Torrent = require('./torrent');


/**
 * Check if field that should be a buffer and exists is a buffer.
 *
 * @param {Object} torrent
 * @param {string} field Key from torrent object to check
 * @return {!string} Possible error
 */
const checkBuffer = (torrent, field) => {
  return torrent[field] && !Buffer.isBuffer(torrent[field]) ?
    '`' + field + '` is not a buffer' : null;
};


/**
 * Checks announce fields are correct.
 *
 * @param {Object} torrent
 * @return {!string} Possible error
 */
const checkAnnounce = (torrent) => {
  let err;
  if (!torrent.announce && !torrent['announce-list']) {
    return '`announce` and `announce-list` fields not found';
  }
  if ((err = checkBuffer(torrent, 'announce'))) return err;
  if (!util.isURL(torrent.announce)) return '`announce` is not a URL';
  return null;
};


/**
 * Checks announce list field.
 *
 * @param {Object} torrent
 * @return {!string} Possible error
 */
const checkAnnounceList = exports.announceList = (list) => {
  if (list) {
    if (!Array.isArray(list)) return '`announce-list` is not a list';

    for (let item of list) {
      if (!Array.isArray(item)) {
        return '`announce-list` is not a list of lists';
      }
      for (let ann of item) {
        if (!Buffer.isBuffer(ann)) {
          return 'Item in `announce-list` is not a buffer';
        }
        if (!util.isURL(ann)) {
          return 'Item in `announce-list` list is not a URL';
        }
      }
    }
  }
  return null;
};


/**
 * Check if the creation date exists and is an integer.
 *
 * @param {number} date
 * @return {!string} Possible error
 */
const checkCreationDate = (date) => {
  return date != null && !util.isInteger(date) ?
    '`creation date` is not an integer' : null;
};


/**
 * Check md5 sum of torrent is correct.
 *
 * @param {Object} parent Info metadata of torrent or file object if
 *   in multi file mode.
 * @return {!string} Possible error
 */
const md5sumRegexp = /[a-f0-9]{32}/i;
const checkmd5sum = (parent) => {
  if (parent.md5sum != null) {
    if (!Buffer.isBuffer(parent.md5sum)) return '`md5sum` is not a buffer';
    if (!md5sumRegexp.test(parent.md5sum)) {
      return '`md5sum` is not a 32 length hex in file';
    }
  }
  return null;
};


/**
 * Converts all buffers in the torrent object to utf8 strings.
 * Except for the key `info.pieces` which will remain a buffer.
 *
 * @param {Object} torrent
 */
const buf2str = (torrent, path) => {
  Object.keys(torrent).forEach((key) => {
    const val = torrent[key];
    
    if (Buffer.isBuffer(val)) {
      if (path !== '.info' || key !== 'pieces') {
        torrent[key] = val.toString('utf8');
      }
    } else if (typeof val === 'object') {
      buf2str(val, path + '.' + key);
    }
  });
};


/**
 * Checks torrent metadata is correct.
 *
 * @param {Object} torrent
 * @return {!string} Possible error with the torrent object
 */
const checkTorrent = exports.checkTorrent = (torrent) => {
  let err;

  if (typeof torrent !== 'object') return 'Torrent is not hash';
  if ((err = checkAnnounce(torrent, 'announce'))) return err;
  if ((err = checkAnnounceList(torrent['announce-list']))) return err;
  if ((err = checkCreationDate(torrent['creation date']))) return err;
  if ((err = checkBuffer(torrent, 'comment'))) return err;
  if ((err = checkBuffer(torrent, 'created by'))) return err;
  if ((err = checkBuffer(torrent, 'encoding'))) return err;

  if (torrent.info == null) return '`info` field not found';

  // Multi file mode.
  if (torrent.info.files != null) {
    if (!Array.isArray(torrent.info.files)) return '`info.files` is not a list';
    for (let file of torrent.info.files) {
      if (file.length == null) {
        return '`length` field not found in file';
      }
      if (!util.isInteger(file.length) || file.length < 0) {
        return '`length` is not a positive integer in file';
      }
      if ((err = checkmd5sum(file))) return err;
      if (!file.path) return '`path` field not found in file';
      if (!Array.isArray(file.path)) return '`path` is not a list in file';

      if (!file.path.some(Buffer.isBuffer)) {
        return '`path` is not a list of buffers in file';
      }
    }
    if (torrent.info.length != null) {
      return 'Cannot have `info.length` in multi file mode';
    }
    if (torrent.info.md5sum != null) {
      return 'Cannot have `info.md5sum` in multi file mode';
    }

  // Single file mode.
  } else {
    if (torrent.info.length == null) {
      return '`info.length` not found in single file mode';
    }
    if (!util.isInteger(torrent.info.length || torrent.info.length < 0)) {
      return '`info.length` is not a positive integer in file';
    }
    if ((err = checkmd5sum(torrent.info))) return err;
  }

  if ((err = checkBuffer(torrent.info, 'name'))) return err;
  if (torrent.info['piece length'] == null) {
    return '`info.piece length` not found';
  }
  if (!util.isInteger(torrent.info['piece length']) ||
      torrent.info['piece length'] < 0) {
    return '`info.piece length` is not a positive integer';
  }
  if (torrent.info.pieces == null) return '`info.pieces` not found';
  if (!Buffer.isBuffer(torrent.info.pieces)) {
    return '`info.pieces` is not a buffer';
  }
  if (torrent.info.pieces.length % 20 !== 0) {
    return '`info.pieces` length is not divisible by 20';
  }
  if (torrent.info.private != null &&
      torrent.info.private !== 0 && torrent.info.private !== 1) {
    return '`info.private` can only be 0 or 1';
  }
  if ((err = checkBuffer(torrent.info, 'source'))) return err;
  return null;
};


/**
 * Checks a torrent object, makes sure its metadata matches the schema.
 *
 * @param {Object} torrent
 * @param {Function(!Error, Torrent)} callback
 */
exports.validate = (torrent, callback) => {
  let errmsg = checkTorrent(torrent);
  if (errmsg !== null) {
    let err = Error(errmsg);
    err.name = 'SchemaError';
    return callback(err);
  }

  // Convert all buffers into strings that are not hash pieces.
  buf2str(torrent, '');

  // Put metadata into torrent object and call callback with the result.
  callback(null, new Torrent(torrent));
};
