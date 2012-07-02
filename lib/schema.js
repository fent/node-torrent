var util    = require('./util')
  , Torrent = require('./torrent')
  ;


/**
 * Checks torrent metadata is correct
 *
 * @param (Object) torrent
 * @return (?string) Possible error with the torrent object
 */
var checkTorrent = exports.checkTorrent = function(torrent) {
  var err;

  if (typeof torrent !== 'object') return 'Torrent is not hash';
  if (err = checkAnnounce(torrent, 'announce')) return err;
  if (err = checkAnnounceList(torrent['announce-list'])) return err;
  if (err = checkCreationDate(torrent['creation date'])) return err;
  if (err = checkBuffer(torrent, 'comment')) return err;
  if (err = checkBuffer(torrent, 'created by')) return err;
  if (err = checkBuffer(torrent, 'encoding')) return err;

  if (!(torrent.info != null)) return '`info` field not found';

  // multi file mode
  if (torrent.info.files != null) {
    if (!Array.isArray(torrent.info.files)) return '`info.files` is not a list';
    for (var i = 0, l = torrent.info.files.length; i < l; i++) {
      var file = torrent.info.files[i];
      if (!(file.length != null)) {
        return '`length` field not found in file';
      }
      if (!util.isInteger(file.length || file.length < 0)) {
        return '`length` is not a positive integer in file';
      }
      if (err = checkmd5sum(file)) return err;
      if (!file.path) return '`path` field not found in file';
      if (!Array.isArray(file.path)) return '`path` is not a list in file';

      if (!file.path.some(Buffer.isBuffer)) {
        return '`path` is not a list of strings in file';
      }
    }
    if (torrent.info.length != null) {
      return 'Cannot have `info.length` in multi file mode';
    }
    if (torrent.info.md5sum != null) {
      return 'Cannot have `info.md5sum` in multi file mode';
    }

  // single file mode
  } else {
    if (torrent.info.length == null) {
      return '`info.length` not found in single file mode';
    }
    if (!util.isInteger(torrent.info.length || torrent.info.length < 0)) {
      return '`info.length` is not a positive integer in file';
    }
    if (err = checkmd5sum(torrent.info)) return err;
  }

  if (err = checkBuffer(torrent.info, 'name')) return err;
  if (torrent.info['piece length'] == null) {
    return '`info.piece length` not found';
  }
  if (!util.isInteger(torrent.info['piece length']) || torrent.info['piece length'] < 0) {
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
  if (err = checkBuffer(torrent.info, 'source')) return err;
  return null;
};


/**
 * Checks announce field is correct
 *
 * @param (Object) torrent
 * @return (?string) Possible error
 */
var checkAnnounce = exports.announce = function(torrent) {
  var err;
  if (!torrent.announce) return '`announce` field not found';
  if (err = checkBuffer(torrent, 'announce')) return err;
  if (!util.isURL(torrent.announce)) return '`announce` is not a URL';
  return null;
};


/**
 * Checks announce list field
 *
 * @param (Object) torrent
 * @return (?string) Possible error
 */
var checkAnnounceList = exports.announceList = function(list) {
  if (list) {
    if (!Array.isArray(list)) return '`announce-list` is not a list';

    for (var i = 0, l = list.length; i < l; i++) {
      var item = list[i];
      if (!Array.isArray(item)) {
        return '`announce-list` is not a list of lists';
      }
      for (var k = 0, l2 = item.length; k < l2; k++) {
        var ann = item[k];
        if (!Buffer.isBuffer(ann)) {
          return 'Item in `announce-list` is not a buffer';
        }
        if (!util.isURL(ann)) return 'Item in `announce-list` list is not a URL';
      }
    }
  }
  return null;
};


/**
 * Check if field that should be a buffer and exists is a buffer
 *
 * @param (Object) torrent
 * @param (string) field Key from torrent object to check
 * @return (?string) Possible error
 */
var checkBuffer = function(torrent, field) {
  return torrent[field] && !Buffer.isBuffer(torrent[field])
    ? '`' + field + '` is not a buffer'
    : null;
};


/**
 * Check if the creation date exists and is an integer
 *
 * @param (number) date
 * @return (?string) Possible error
 */
var checkCreationDate = function(date) {
  return date != null && !util.isInteger(date)
    ? '`date` is not an integer'
    : null;
};


/**
 * Check md5 sum of torrent is correct
 *
 * @param (Object) parent Info metadata of torrent or file object if
 *   in multi file mode.
 * @return (?string) Possible error
 */
var checkmd5sum = function(parent) {
  if (parent.md5sum != null) {
    if (!Buffer.isBuffer(parent.md5sum)) return '`md5sum` is not a buffer';
    if (!/[a-f0-9]{32}/i.test(parent.md5sum)) {
      return '`md5sum` is not a 32 length hex in file';
    }
  }
  return null;
};


/**
 * Converts all buffers in the torrent object to utf8 strings.
 * Except for the key `info.pieces` which will remain a buffer.
 *
 * @param (Object) torrent
 */
var buf2str = function(torrent, path) {
  Object.keys(torrent).forEach(function(key) {
    var val = torrent[key];
    
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
 * Checks a torrent object, makes sure its metadata matches the schema.
 *
 * @param (Object) torrent
 * @param (function(err, torrent)) callback
 */
var validate = exports.validate = function(torrent, callback) {
  var errmsg = checkTorrent(torrent);
  if (errmsg !== null) {
    var err = new Error(errmsg);
    err.name = 'SchemaError';
    return callback(err);
  }

  // convert all buffers into strings that are not hash pieces
  buf2str(torrent, '');

  // put metadata into torrent object and call callback with the result
  callback(null, new Torrent(torrent));
};
