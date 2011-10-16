(function() {
  var URL, b, checkAnnounce, checkAnnounceList, checkBuffer, checkCreationDate, checkTorrent, checkmd5sum, crypto, getInfoHash, isInteger, isURL, validate;
  crypto = require('crypto');
  b = require('bncode');
  URL = /^((http|udp|ftp)s?:\/\/)?([a-zA-Z1-90-]{2,}\.)+?([a-zA-Z1-90-]{2,6})(:\d{2,})?(\/\S+)*$/;
  isURL = function(str) {
    return URL.test(str);
  };
  isInteger = function(n) {
    return !isNaN(parseInt(n));
  };
  checkTorrent = function(torrent) {
    var err, file, i, p, _i, _len, _len2, _ref, _ref2;
    if (typeof torrent !== 'object') {
      return 'Torrent is not hash';
    }
    if (err = checkAnnounce(torrent, 'announce')) {
      return err;
    }
    if (err = checkAnnounceList(torrent['announce-list'])) {
      return err;
    }
    if (err = checkCreationDate(torrent['creation date'])) {
      return err;
    }
    if (err = checkBuffer(torrent, 'comment')) {
      return err;
    }
    if (err = checkBuffer(torrent, 'created by')) {
      return err;
    }
    if (err = checkBuffer(torrent, 'encoding')) {
      return err;
    }
    if (!(torrent.info != null)) {
      return '`info` field not found';
    }
    if (torrent.info.files != null) {
      if (!Array.isArray(torrent.info.files)) {
        return '`info.files` is not a list';
      }
      _ref = torrent.info.files;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        if (!(file.length != null)) {
          return '`length` field not found in file';
        }
        if (!isInteger(file.length || file.length < 0)) {
          return '`length` is not a positive integer in file';
        }
        if (err = checkmd5sum(file)) {
          return err;
        }
        if (!(file.path != null)) {
          return '`path` field not found in file';
        }
        if (!Array.isArray(file.path)) {
          return '`path` is not a list in file';
        }
        _ref2 = file.path;
        for (i = 0, _len2 = _ref2.length; i < _len2; i++) {
          p = _ref2[i];
          if (!Buffer.isBuffer(p)) {
            return '`path` is not a list of strings in file';
          }
          file.path[i] = p.toString('utf8');
        }
      }
      if (torrent.info.length != null) {
        return 'Cannot have `info.length` in multi file mode';
      }
      if (torrent.info.md5sum != null) {
        return 'Cannot have `info.md5sum` in multi file mode';
      }
    } else {
      if (!(torrent.info.length != null)) {
        return '`info.length` not found in single file mode';
      }
      if (!isInteger(torrent.info.length || torrent.info.length < 0)) {
        return '`info.length` is not a positive integer in file';
      }
      if (err = checkmd5sum(torrent.info)) {
        return err;
      }
    }
    if (err = checkBuffer(torrent.info, 'name')) {
      return err;
    }
    if (!(torrent.info['piece length'] != null)) {
      return '`info.piece length` not found';
    }
    if (!isInteger(torrent.info['piece length']) || torrent.info['piece length'] < 0) {
      return '`info.piece length` is not a positive integer';
    }
    if (!(torrent.info.pieces != null)) {
      return '`info.pieces` not found';
    }
    if (!Buffer.isBuffer(torrent.info.pieces)) {
      return '`info.pieces` is not a buffer';
    }
    if (torrent.info.pieces.length % 20 !== 0) {
      return '`info.pieces` length is not divisible by 20';
    }
    if (torrent.info.private != null) {
      if (torrent.info.private !== 0 && torrent.info.private !== 1) {
        return '`info.private` can only be 0 or 1';
      }
    }
    if (err = checkBuffer(torrent.info, 'source')) {
      return err;
    }
    return null;
  };
  checkAnnounce = function(torrent) {
    var err;
    if (!torrent.announce) {
      return '`announce` field not found';
    }
    if (err = checkBuffer(torrent, 'announce')) {
      return err;
    }
    if (!isURL(torrent.announce)) {
      return '`announce` is not a URL';
    }
    return null;
  };
  checkAnnounceList = function(list) {
    var ann, i, item, _i, _len, _len2;
    if (list) {
      if (!Array.isArray(list)) {
        return '`announce-list` is not a list';
      }
      for (_i = 0, _len = list.length; _i < _len; _i++) {
        item = list[_i];
        if (!Array.isArray(item)) {
          return '`announce-list` is not a list of lists';
        }
        for (i = 0, _len2 = item.length; i < _len2; i++) {
          ann = item[i];
          if (!Buffer.isBuffer(ann)) {
            return 'Field in `announce-list` is not a buffer';
          }
          item[i] = ann.toString('utf8');
          if (!isURL(item[i])) {
            return 'Item in `announce-list` list is not a URL';
          }
        }
      }
    }
    return null;
  };
  checkBuffer = function(torrent, field) {
    if (torrent[field]) {
      if (!Buffer.isBuffer(torrent[field])) {
        return "`" + field + "` is not a buffer";
      }
      torrent[field] = torrent[field].toString('utf8');
    }
    return null;
  };
  checkCreationDate = function(date) {
    if ((date != null) && !isInteger(date)) {
      return '`date` is not an integer';
    }
    return null;
  };
  checkmd5sum = function(parent) {
    if (parent.md5sum != null) {
      if (!Buffer.isBuffer(parent.md5sum)) {
        return '`md5sum` is not a buffer';
      }
      parent.md5sum = parent.md5sum.toString('utf8');
      if (!/[a-f0-9]{32}/i.test(parent.md5sum)) {
        return '`md5sum` is not a 32 length hex in file';
      }
    }
    return null;
  };
  validate = function(torrent, buf, callback) {
    var err;
    err = checkTorrent(torrent);
    if (err !== null) {
      err = new Error(err);
      err.name = 'SchemaError';
      return callback(err);
    }
    return callback(null, torrent, buf);
  };
  getInfoHash = function(torrent) {
    return crypto.createHash('sha1').update(b.encode(torrent.info)).digest('hex');
  };
  module.exports = {
    isURL: isURL,
    validate: validate,
    torrent: checkTorrent,
    announce: checkAnnounce,
    announceList: checkAnnounceList,
    getInfoHash: getInfoHash
  };
}).call(this);
