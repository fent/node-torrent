(function() {
  var APP_NAME, EventEmitter, POWERS, SIZES, URL, VERSION, b, crypto, fs, hash, isURL, path, request, toBytes;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  fs = require('fs');
  path = require('path');
  crypto = require('crypto');
  EventEmitter = require('events').EventEmitter;
  request = require('request');
  b = require('bencode');
  hash = require('./hash');
  APP_NAME = 'node-torrent';
  VERSION = 'v0.1.0';
  URL = /^((http|udp)s?:\/\/)?(www\.)?([a-zA-Z1-90-]{2,}\.)+?([a-zA-Z-]{2,6})(:\d{2,})?(\/\S+)*$/;
  isURL = function(str) {
    return URL.test(str);
  };
  SIZES = /((\d)+(\.\d+)?)(m|g|t)?b?/i;
  POWERS = {
    k: 10,
    m: 20,
    g: 30
  };
  toBytes = function(str) {
    var c, num, result;
    result = SIZES.exec(str);
    num = parseFloat(result[1]);
    c = result[4].toLowerCase();
    if (POWERS[c]) {
      return Math.round(num * (1 << POWERS[c]));
    } else {
      return num;
    }
  };
  module.exports = {
    getInfoHash: function(torrent) {
      return crypto.createHash('sha1').update(b.encode(torrent.info)).digest('hex').toUpperCase();
    },
    read: function(file, requestOptions, callback) {
      if (requestOptions == null) {
        requestOptions = {};
      }
      if (typeof requestOptions === 'function') {
        callback = requestOptions;
      }
      if (isURL(file)) {
        return this.readURL(file, requestOptions, callback);
      } else if (path.existsSync(file)) {
        return this.readFile(file, callback);
      } else {
        return callback(new Error('Not a URL or file does not exists'));
      }
    },
    readURL: function(url, requestOptions, callback) {
      if (typeof requestOptions === 'function') {
        callback = requestOptions;
      } else {
        requestOptions.url = url;
        requestOptions.encoding = 'binary';
      }
      return request(requestOptions, __bind(function(err, res, body) {
        if (err) {
          return callback(err);
        }
        return this.readRaw(body, callback);
      }, this));
    },
    readFile: function(file, callback) {
      return fs.readFile(file, 'binary', __bind(function(err, data) {
        if (err) {
          return callback(err);
        }
        return this.readRaw(data, callback);
      }, this));
    },
    readRaw: function(rawdata, callback) {
      var result;
      try {
        result = b.decode(rawdata);
        hash = this.getInfoHash(result);
        return callback(null, hash, result, rawdata);
      } catch (err) {
        return callback(err);
      }
    },
    make: function(announce, dir, files, options, callback) {
      var hashOptions, info, innerList, maxBytes, msg, pieceLength, torrent, url, _i, _j, _len, _len2, _ref;
      if (options == null) {
        options = {};
      }
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      if (!isURL(announce)) {
        return callback(new Error("Not a URL: " + announce));
      }
      if (options.maxMemory) {
        maxBytes = toBytes(options.maxMemory);
      }
      info = {};
      if (options.pieceLength) {
        pieceLength = 1 << options.pieceLength;
      } else {
        pieceLength = 262144;
      }
      if (!Array.isArray(files)) {
        files = [files];
      } else if (files.length === 0) {
        return callback(new Error('no files given'));
      } else if (files.length > 1 && !options.name) {
        return callback(new Error('must specify name in multi file mode'));
      }
      torrent = {};
      torrent.announce = announce;
      if (options.announceList != null) {
        msg = 'announce list needs to be a list of lists';
        if (!Array.isArray(options.announceList)) {
          return callback(new Error(msg));
        }
        _ref = options.announceList;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          innerList = _ref[_i];
          if (!Array.isArray(innerList)) {
            return callback(new Error(msg));
          }
          for (_j = 0, _len2 = innerList.length; _j < _len2; _j++) {
            url = innerList[_j];
            if (!isURL(url)) {
              return callback(new Error("Not a URL: " + url));
            }
          }
        }
        torrent['announce-list'] = options.announceList;
      }
      if (options.comment != null) {
        torrent.comment = options.comment;
      }
      torrent['created by'] = "" + APP_NAME + " " + VERSION;
      torrent['creation date'] = Math.round(Date.now() / 1000);
      torrent.info = info;
      hashOptions = {
        maxFiles: options.maxFiles,
        maxBytes: maxBytes
      };
      return hash(dir, files, pieceLength, hashOptions, function(err, emitter, pieces, files) {
        if (err) {
          return callback(err);
        }
        if (files.length > 1) {
          info.files = files;
          info.name = options.name;
        } else {
          info.name = files[0].path.join('/');
          info.length = files[0].length;
        }
        info['piece length'] = pieceLength;
        info.pieces = null;
        if (options.private) {
          info.private = 1;
        }
        if (options.source) {
          info.source = options.source;
        }
        emitter.on('error', function(err) {
          return emitter.stop(err);
        });
        emitter.on('end', function(pieces) {
          return info.pieces = pieces;
        });
        return callback(null, emitter, pieces, torrent);
      });
    },
    write: function(filename, announce, dir, files, options, callback) {
      var _ref;
      if (options == null) {
        options = {};
      }
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
            if ((_ref = options.name) != null) {
        _ref;
      } else {
        options.name = path.basename(filename, '.torrent');
      };
      return fs.open(filename, 'w', 0666, __bind(function(err, fd) {
        if (err) {
          return callback(err);
        }
        return this.make(announce, dir, files, options, function(err, emitter, pieces, torrent) {
          var data, dict, piecesLength, piecesPosition, strData;
          if (err) {
            return callback(err);
          }
          piecesLength = 20 * pieces;
          torrent.info.pieces = new Buffer(piecesLength).toString();
          data = new Buffer(b.encode(torrent), 'binary');
          strData = data.toString();
          dict = "6:pieces" + piecesLength + ":";
          piecesPosition = strData.indexOf(dict) + dict.length;
          piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition));
          fs.write(fd, data, 0, data.length, 0, function(err) {
            if (err) {
              return emitter.emit('error', err);
            }
          });
          emitter.on('hash', function(index, hash, percent) {
            var position;
            position = piecesPosition + index * 20;
            fs.write(fd, new Buffer(hash, 'binary'), 0, 20, position, function(err) {
              if (err) {
                return emitter.emit('error', err);
              }
            });
            return emitter.emit('progress', percent);
          });
          emitter.on('error', function(err) {
            return emitter.stop(err);
          });
          emitter.on('end', function() {
            return fs.close(fd, function(err) {
              if (err) {
                return emitter.emit('error', err);
              }
            });
          });
          return callback(null, emitter);
        });
      }, this));
    },
    hashCheck: function(info, dir, options, callback) {
      var hashOptions, maxBytes, pieces;
      if (options == null) {
        options = {};
      }
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      if (options.maxMemory) {
        maxBytes = toBytes(options.maxMemory);
      }
      pieces = info.pieces.match(/[\s\S]{20}/g);
      hashOptions = {
        maxFiles: options.maxFiles,
        maxBytes: maxBytes
      };
      return hash(dir, info.files, info['piece length'], hashOptions, function(err, emitter, totalPieces, files) {
        var percentMatched, piecesMatched;
        if (err) {
          return callback(err);
        }
        percentMatched = piecesMatched = 0;
        emitter.on('hash', function(index, hash, percent, file, position, length) {
          if (pieces[index] === hash) {
            percentMatched = Math.round(++piecesMatched / pieces * 1000) / 1000;
            return emitter.emit('match', index, hash, percentMatched, file, position, length);
          } else {
            return emitter.emit('error', new Error("Piece " + index + " does not match"));
          }
        });
        return callback(null, emitter);
      });
    }
  };
}).call(this);
