(function() {
  var Buffers, EventEmitter, MAX_BYTES_ALLOCATED, MAX_FILES_OPENED, async, crypto, fs, path, queue, round, sha1;

  path = require('path');

  fs = require('fs');

  crypto = require('crypto');

  EventEmitter = require('events').EventEmitter;

  Buffers = require('buffers');

  async = require('async');

  queue = require('./queue');

  MAX_FILES_OPENED = 250;

  MAX_BYTES_ALLOCATED = 536870912;

  sha1 = function(buffer) {
    return crypto.createHash('sha1').update(buffer).digest();
  };

  round = function(num, dec) {
    var pow;
    pow = Math.pow(10, dec);
    return Math.round(num * pow) / pow;
  };

  module.exports = function(dir, list, pieceLength, options, callback) {
    var emitter, files, filetasks, pieces, _ref, _ref2;
    if (options == null) options = {};
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if ((_ref = options.maxFiles) == null) options.maxFiles = MAX_FILES_OPENED;
    if ((_ref2 = options.maxBytes) == null) options.maxBytes = MAX_BYTES_ALLOCATED;
    emitter = new EventEmitter();
    files = [];
    filetasks = [];
    pieces = [];
    return path.exists(dir, function(exists) {
      var fileFun, funs;
      if (!exists) return callback(new Error("" + dir + " does not exist"));
      if (typeof list[0] === 'string') {
        fileFun = function(file, i, callback) {
          var filepath;
          filepath = path.join(dir, file);
          return path.exists(filepath, function(exists) {
            if (!exists) {
              return callback(new Error("" + filepath + " does not exist"));
            }
            return fs.stat(filepath, function(err, stat) {
              if (err) return callback(err);
              files[i] = {
                length: stat.size,
                path: file.split('/')
              };
              filetasks[i] = {
                file: file,
                length: stat.size,
                readtasks: []
              };
              return callback(null);
            });
          });
        };
      } else {
        files = list;
        fileFun = function(file, i, callback) {
          filetasks[i] = {
            file: file.path.join('/'),
            length: file.length,
            readtasks: []
          };
          return callback(null);
        };
      }
      funs = [];
      list.forEach(function(file, i) {
        return funs.push(function(callback) {
          return fileFun(file, i, callback);
        });
      });
      return async.parallel(funs, function(err) {
        var bytesAllocated, bytesLeft, checkBytes, file, filesqueue, i, length, offset, piece, piecesHashed, position, task, totalBytesRead, totalSize, _i, _len, _len2;
        if (err) return callback(err);
        totalSize = totalBytesRead = piece = offset = 0;
        for (i = 0, _len = files.length; i < _len; i++) {
          file = files[i];
          task = filetasks[i];
          totalSize += task.length;
          position = 0;
          bytesLeft = task.length;
          while (0 !== bytesLeft) {
            length = Math.min(bytesLeft, pieceLength);
            if (length > offset) length -= offset;
            bytesLeft -= length;
            if (!pieces[piece]) {
              pieces.push({
                buffer: null,
                length: length
              });
            } else {
              pieces[piece].length += length;
            }
            task.readtasks.push({
              piece: piece,
              offset: offset,
              length: length,
              position: position
            });
            totalBytesRead += length;
            position += length;
            piece = Math.floor(totalBytesRead / pieceLength);
            offset = totalBytesRead % pieceLength;
          }
        }
        piecesHashed = 0;
        bytesAllocated = 0;
        checkBytes = function(workers, task) {
          return bytesAllocated + task.length < options.maxBytes;
        };
        emitter.stop = function(err) {
          return emitter.err = err;
        };
        filesqueue = queue(function(task, callback) {
          if (emitter.err) return callback(emitter.err);
          return fs.open(path.join(dir, task.file), 'r', 0666, function(err, fd) {
            var readqueue, readtask, _i, _len2, _ref3, _results;
            if (err) {
              emitter.emit('err', err);
              return callback();
            }
            emitter.emit('open', task.file);
            readqueue = queue(function(task, callback) {
              if (emitter.err) return callback(emitter.err);
              bytesAllocated += task.length;
              if (!pieces[task.piece].buffer) {
                pieces[task.piece].buffer = new Buffer(pieces[task.piece].length);
              }
              return fs.read(task.fd, pieces[task.piece].buffer, task.offset, task.length, task.position, function(err, bytesRead, buffer) {
                var percent;
                if (err) {
                  emitter.emit('error', err);
                  return callback();
                }
                pieces[task.piece].length -= task.length;
                if (pieces[task.piece].length === 0) {
                  length = pieces[task.piece].buffer.length;
                  pieces[task.piece] = new Buffer(sha1(pieces[task.piece].buffer), 'binary');
                  percent = round(++piecesHashed / pieces.length * 100, 2);
                  emitter.emit('hash', task.piece, pieces[task.piece], percent, task.file, task.position, task.length);
                  bytesAllocated -= length;
                }
                return callback();
              });
            }, checkBytes);
            readqueue.drain = function() {
              fs.close(fd, function(err) {
                if (err) emitter.emit('error', err);
                return emitter.emit('close', task.file);
              });
              return callback();
            };
            _ref3 = task.readtasks;
            _results = [];
            for (_i = 0, _len2 = _ref3.length; _i < _len2; _i++) {
              readtask = _ref3[_i];
              readtask.file = file;
              readtask.fd = fd;
              _results.push(readqueue.push(readtask));
            }
            return _results;
          });
        }, options.maxFiles);
        filesqueue.drain = function() {
          var buf, p, _i, _len2;
          buf = Buffers();
          for (_i = 0, _len2 = pieces.length; _i < _len2; _i++) {
            p = pieces[_i];
            buf.push(p);
          }
          return emitter.emit('end', buf.toBuffer());
        };
        for (_i = 0, _len2 = filetasks.length; _i < _len2; _i++) {
          task = filetasks[_i];
          filesqueue.push(task);
        }
        return callback(null, emitter, piece + 1, files);
      });
    });
  };

}).call(this);
