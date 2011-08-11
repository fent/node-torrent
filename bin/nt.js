#!/usr/bin/env node
(function() {
  var CLEAR, argv, async, basename, dir, f, file, findit, folder, fs, funs, logerr, nt, path, removeFolder, removeForwardSlash, _fn, _i, _len, _ref;
  console.time('time taken');
  fs = require('fs');
  path = require('path');
  nt = require('../lib/torrent');
  async = require('async');
  findit = require('findit');
  argv = require('optimist').usage('nt [options] (file or directory...)+').wrap(78).demand([1, 'a']).alias('a', 'announce').describe('a', 'announce URL').alias('c', 'comment').describe('c', 'add comment to metainfo').alias('n', 'name').describe('n', 'name of torrent').alias('l', 'piece-length').describe('l', 'set piece to 2^n bytes. default is 256KB').alias('p', 'private').describe('p', 'make this a private torrent').alias('s', 'source').describe('s', 'add source to metainfo\nuseful to generate a different info hash').alias('o', 'output').describe('o', 'where to write output file').alias('f', 'max-files').describe('f', 'max amount of files to open during hashing').alias('m', 'max-memory').describe('m', 'max amount of memory to allocate while hashing\ncan be a string that matches (\d)+(\.\d+)?(m|g|t)?b?\ndefault is 512MB').boolean('p').argv;
  CLEAR = '                                                  ';
  logerr = function(err) {
    throw err;
    return console.log('Error: ' + (typeof err === 'string' ? err : err.message));
  };
  removeForwardSlash = function(path) {
    if (path.charAt(path.length - 1) === '/') {
      return path.substr(0, path.length - 1);
    } else {
      return path;
    }
  };
  basename = function(file) {
    var ext;
    ext = path.extname(file);
    return file.substr(0, file.length - ext.length);
  };
  dir = './';
  folder = null;
  removeFolder = function(path) {
    return path;
  };
  if (argv._.length === 1) {
    f = function(callback) {
      return fs.stat(argv._[0], function(err, stats) {
        if (err) {
          return callback(err);
        }
        if (stats.isDirectory()) {
          dir = argv._[0];
          folder = removeForwardSlash(argv._[0]);
          removeFolder = function(path) {
            return path.split('/').slice(1).join('/');
          };
        }
        return callback();
      });
    };
  } else {
    f = function(callback) {
      return './';
    };
  }
  funs = [f];
  _ref = argv._;
  _fn = function(file) {
    return funs.push(function(callback) {
      var emitter, files;
      if (!path.existsSync(file)) {
        return callback(new Error("" + file + " does not exist"));
      }
      files = [];
      file = removeForwardSlash(path.normalize(file));
      emitter = findit.find(file);
      emitter.on('file', function(file) {
        return files.push(removeFolder(file));
      });
      return emitter.on('end', function() {
        return callback(null, files);
      });
    });
  };
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    file = _ref[_i];
    _fn(file);
  }
  async.parallel(funs, function(err, results) {
    var announce, announceList, filename, files, options, r, url, _j, _k, _len2, _len3, _ref2;
    if (err) {
      return logerr(err);
    }
    files = [];
    results = results.slice(1);
    for (_j = 0, _len2 = results.length; _j < _len2; _j++) {
      r = results[_j];
      files = files.concat(r);
    }
    if (files.length === 0) {
      return logerr('no files to add');
    }
    filename = argv.output || argv.name || folder || basename(files[0]);
    if (path.extname(filename) !== 'torrent') {
      filename += '.torrent';
    }
    if (Array.isArray(argv.announce)) {
      announce = argv.announce.shift();
      announceList = [];
      _ref2 = argv.announce;
      for (_k = 0, _len3 = _ref2.length; _k < _len3; _k++) {
        url = _ref2[_k];
        announceList.push([url]);
      }
    } else {
      announce = argv.announce;
    }
    options = {
      announceList: announceList,
      comment: argv.comment,
      name: argv.name,
      pieceLength: argv['piece-length'],
      private: argv.private,
      source: argv.source,
      maxFiles: argv['max-files'],
      maxMemory: argv['max-memory']
    };
    return nt.write(filename, announce, dir, files, options, function(err, emitter) {
      if (err) {
        return logerr;
      }
      emitter.on('error', function(err) {
        throw err;
      });
      emitter.on('progress', function(percent) {
        var bar, i, percentStr, rounded;
        percentStr = percent.toFixed(2);
        while (percentStr.length < 6) {
          percentStr = ' ' + percentStr;
        }
        rounded = Math.round(percent / 2);
        bar = '';
        for (i = 0; 0 <= rounded ? i <= rounded : i >= rounded; 0 <= rounded ? i++ : i--) {
          bar += '=';
        }
        process.stdout.write(" [" + ((bar + '>').substr(0, 50)) + (CLEAR.substr(0, 49 - bar.length)) + "] " + percentStr + "%\r");
        if (percent === 100) {
          console.log("\nfinished writing torrent at " + filename);
          return console.timeEnd('time taken');
        }
      });
      return process.on('SIGINT', function() {
        emitter.stop();
        process.stdout.write('\n');
        return process.exit(1);
      });
    });
  });
}).call(this);
