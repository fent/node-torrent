(function() {
  var APP_NAME, EventEmitter, POWERS, SIZES, VERSION, b, edit, fs, hash, hashCheck, http, https, make, path, read, readFile, readRaw, readURL, schema, toBytes, url, write;

  url = require('url');

  http = require('http');

  https = require('https');

  fs = require('fs');

  path = require('path');

  EventEmitter = require('events').EventEmitter;

  b = require('bncode');

  hash = require('./hash');

  schema = require('./schema');

  APP_NAME = 'node-torrent';

  VERSION = 'v0.1.0';

  SIZES = /((\d)+(\.\d+)?)(k|m|g|t)?b?/i;

  POWERS = {
    k: 10,
    m: 20,
    g: 30,
    t: 40
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

  read = function(file, requestOptions, callback) {
    if (requestOptions == null) requestOptions = {};
    if (typeof requestOptions === 'function') callback = requestOptions;
    if (schema.isURL(file)) {
      return readURL(file, requestOptions, callback);
    } else {
      return path.exists(file, function(exists) {
        if (exists) {
          return readFile(file, callback);
        } else {
          return callback(new Error('Not a URL and file does not exists'));
        }
      });
    }
  };

  readURL = function(urladdr, requestOptions, callback) {
    var decoder, f, parsed, protocol, req;
    if (requestOptions == null) requestOptions = {};
    if (typeof requestOptions === 'function') {
      callback = requestOptions;
      requestOptions = {};
    }
    parsed = url.parse(urladdr);
    protocol = parsed.protocol.substring(0, parsed.protocol.length - 1);
    switch (protocol) {
      case 'http':
        f = http;
        break;
      case 'https':
        f = https;
        break;
      default:
        return callback(new Error("Protocol '" + protocol + "' not supported"));
    }
    requestOptions.host = parsed.host;
    requestOptions.port = parsed.port;
    requestOptions.path = parsed.pathname + (parsed.search ? parsed.search : '' + (parsed.hash ? parsed.hash : ''));
    decoder = new b.decoder();
    return req = f.get(requestOptions, function(res) {
      if (res.statusCode !== 200) return callback(new Error('404 file not found'));
      res.on('data', function(data) {
        try {
          return decoder.decode(data);
        } catch (err) {
          req.abort();
          return callback(err);
        }
      });
      return res.on('end', function() {
        return schema.validate(decoder.result()[0], callback);
      });
    }).on('error', function(err) {
      return callback(err);
    });
  };

  readFile = function(file, callback) {
    var decoder, rs;
    rs = fs.createReadStream(file);
    rs.on('error', function(err) {
      return callback(err);
    });
    decoder = new b.decoder();
    rs.on('data', function(data) {
      try {
        return decoder.decode(data);
      } catch (err) {
        fs.close(rs.fd);
        return callback(err);
      }
    });
    return rs.on('end', function() {
      return schema.validate(decoder.result()[0], callback);
    });
  };

  readRaw = function(buf, callback) {
    try {
      return schema.validate(b.decode(buf), callback);
    } catch (err) {
      return callback(err);
    }
  };

  make = function(announce, dir, files, options, callback) {
    var hashOptions, info, innerList, maxBytes, msg, pieceLength, torrent, url, _i, _j, _len, _len2, _ref;
    if (options == null) options = {};
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!schema.isURL(announce)) {
      return callback(new Error("Not a URL: " + announce));
    }
    if (options.maxMemory) maxBytes = toBytes(options.maxMemory);
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
      if (!Array.isArray(options.announceList)) return callback(new Error(msg));
      _ref = options.announceList;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        innerList = _ref[_i];
        if (!Array.isArray(innerList)) return callback(new Error(msg));
        for (_j = 0, _len2 = innerList.length; _j < _len2; _j++) {
          url = innerList[_j];
          if (!schema.isURL(url)) return callback(new Error("Not a URL: " + url));
        }
      }
      torrent['announce-list'] = options.announceList;
    }
    if (options.comment != null) torrent.comment = options.comment;
    torrent['created by'] = "" + APP_NAME + " " + VERSION;
    torrent['creation date'] = Math.round(Date.now() / 1000);
    torrent.info = info;
    hashOptions = {
      maxFiles: options.maxFiles,
      maxBytes: maxBytes
    };
    return hash(dir, files, pieceLength, hashOptions, function(err, emitter, pieces, files) {
      if (err) return callback(err);
      if (files.length > 1) {
        info.files = files;
        info.name = options.name;
      } else {
        info.length = files[0].length;
        info.name = files[0].path.join('/');
      }
      info['piece length'] = pieceLength;
      info.pieces = null;
      if (options.private) info.private = 1;
      if (options.source) info.source = options.source;
      emitter.on('error', function(err) {
        return emitter.stop(err);
      });
      emitter.on('end', function(pieces) {
        return info.pieces = pieces;
      });
      return callback(null, emitter, pieces, torrent);
    });
  };

  write = function(filename, announce, dir, files, options, callback) {
    var _ref;
    if (options == null) options = {};
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if ((_ref = options.name) == null) {
      options.name = path.basename(filename, '.torrent');
    }
    if (path.extname(filename) !== '.torrent') filename += '.torrent';
    return fs.open(filename, 'w', 0666, function(err, fd) {
      if (err) return callback(err);
      return make(announce, dir, files, options, function(err, hashEmitter, pieces, torrent) {
        var data, dict, emitter, piecesLength, piecesPosition, strData;
        if (err) return callback(err);
        emitter = new EventEmitter();
        piecesLength = 20 * pieces;
        torrent.info.pieces = new Buffer(piecesLength);
        data = new Buffer(b.encode(torrent), 'binary');
        strData = data.toString();
        dict = "6:pieces" + torrent.info.pieces.length + ":";
        piecesPosition = strData.indexOf(dict) + dict.length;
        piecesPosition = Buffer.byteLength(strData.substr(0, piecesPosition));
        fs.write(fd, data, 0, data.length, 0, function(err) {
          if (err) return emitter.emit('error', err);
        });
        hashEmitter.on('hash', function(index, hash, percent) {
          var position;
          position = piecesPosition + index * 20;
          fs.write(fd, hash, 0, 20, position, function(err) {
            if (err) return emitter.emit('error', err);
          });
          return emitter.emit('progress', percent);
        });
        hashEmitter.on('error', function(err) {
          hashEmitter.stop(err);
          return emitter.emit('error', err);
        });
        hashEmitter.on('end', function() {
          return fs.close(fd, function(err) {
            if (err) return emitter.emit('error', err);
            return emitter.emit('end');
          });
        });
        return callback(null, emitter, pieces, torrent);
      });
    });
  };

  edit = function(file, options, callback) {
    return read(file, function(err, result) {
      var data, output;
      if (err) return callback(err);
      if (options.announce) result.announce = options.announce;
      if (options.announceList != null) {
        if (options.announceList === false) {
          delete result['announce-list'];
        } else {
          result['announce-list'] = options.announceList;
        }
      }
      if (options.comment != null) {
        if (options.comment === false) {
          delete result.comment;
        } else {
          result.comment = options.comment;
        }
      }
      if ((options.name != null) && (result.info.files != null)) {
        result.info.name = options.name;
      }
      if (options.private != null) {
        if (options.private === false) {
          delete result.info.private;
        } else {
          result.info.private = 1;
        }
      }
      if (options.source != null) {
        if (options.source === false) {
          delete result.info.source;
        } else {
          result.info.source = options.source;
        }
      }
      result['creation date'] = Math.round(Date.now() / 1000);
      if (options.output) {
        output = options.output;
        if (path.extname(output) !== '.torrent') output += '.torrent';
      } else if (schema.isURL(file)) {
        output = path.basename(file);
      } else {
        output = file;
      }
      data = b.encode(result);
      return fs.writeFile(output, data, 'binary', function(err) {
        return callback(err, output, result);
      });
    });
  };

  hashCheck = function(torrent, dir, options, callback) {
    var files, hashOptions, i, maxBytes, pieces, _ref;
    if (options == null) options = {};
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (options.maxMemory) maxBytes = toBytes(options.maxMemory);
    pieces = [];
    for (i = 0, _ref = torrent.info.pieces.length / 20; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
      pieces[i] = torrent.info.pieces.slice(i * 20, (i + 1) * 20);
    }
    hashOptions = {
      maxFiles: options.maxFiles,
      maxBytes: maxBytes
    };
    files = torrent.info.files || [
      {
        path: [torrent.info.name],
        length: torrent.info.length
      }
    ];
    return hash(dir, files, torrent.info['piece length'], hashOptions, function(err, hashEmitter, totalPieces, files) {
      var emitter, percentMatched, piecesMatched;
      if (err) return callback(err);
      emitter = new EventEmitter();
      percentMatched = piecesMatched = 0;
      hashEmitter.on('hash', function(index, hash, percent, file, position, length) {
        var i, match;
        match = true;
        for (i = 0; i < 20; i++) {
          if (pieces[index][i] !== hash[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          percentMatched = Math.round(++piecesMatched / totalPieces * 10000) / 100;
          return emitter.emit('match', index, hash, percentMatched, file, position, length);
        } else {
          return emitter.emit('matcherror', index, file, position, length);
        }
      });
      hashEmitter.on('error', function(err) {
        return emitter.emit('error', err);
      });
      hashEmitter.on('end', function() {
        return emitter.emit('end', percentMatched);
      });
      return callback(null, emitter);
    });
  };

  module.exports = {
    getInfoHash: schema.getInfoHash,
    read: read,
    readFile: readFile,
    readURL: readURL,
    readRaw: readRaw,
    write: write,
    make: make,
    edit: edit,
    hashCheck: hashCheck
  };

}).call(this);
