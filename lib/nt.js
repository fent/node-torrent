(function() {
  var BAR, CLEAR, NOBAR, async, colors, dir, f, file, findit, folder, fs, funs, getAnnounce, logerr, nt, options, path, progress, removeFolder, removeForwardSlash, _fn, _i, _len, _ref;

  options = require('nomnom')().usage('Usage: nt <action> [options] <files>...\n\nactions:\n  make   - Make a torrent\n  edit   - Read a torrent, edit its metainfo variables, and write it\n           Can\'t change its files\n  hash   - Returns info hash from a torrent\n  check  - Hash checks torrent file\n           If no folder is specified, will use cwd\n\noptions:\n  -a, --announce URL              Announce URL. At least one is required\n  -c, --comment COMMENT           Add a comment to the metainfo\n  -n, --name NAME                 Name of torrent\n  -l, --piece-length INT          Set piece to 2^n bytes. Default: 256KB\n  -p, --private                   Make this a private torrent\n  -s, --source STR                Add source to metainfo\n  -o, --output FILE               Where to write output file\n  -f, --max-files INT             Max simultaneous files to open\n  -m, --max-memory STR            Max amount of memory to allocate\n  --folder FOLDER                 Folder to hash check\n').opts({
    announceList: {
      abbr: 'a',
      full: 'announce',
      list: true
    },
    comment: {
      abbr: 'c',
      full: 'comment'
    },
    name: {
      abbr: 'n',
      full: 'name'
    },
    pieceLength: {
      abbr: 'l',
      full: 'piece-length'
    },
    private: {
      abbr: 'p',
      full: 'private',
      flag: true
    },
    source: {
      abbr: 's',
      full: 'source'
    },
    output: {
      abbr: 'o',
      full: 'output'
    },
    maxFiles: {
      abbr: 'f',
      full: 'max-files'
    },
    maxMemory: {
      abbr: 'm',
      full: 'max-memory'
    },
    folder: {
      full: 'folder'
    },
    action: {
      position: 0,
      required: true,
      choices: ['make', 'edit', 'hash', 'check']
    },
    files: {
      position: 1,
      required: true,
      list: true
    }
  }).parseArgs();

  fs = require('fs');

  path = require('path');

  async = require('async');

  findit = require('findit');

  colors = require('colors');

  nt = require('./torrent');

  BAR = '♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥';

  NOBAR = '♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡';

  CLEAR = '                                                  ';

  progress = function(percent) {
    var rounded;
    rounded = Math.round(percent / 2);
    percent = percent.toFixed(2);
    percent = CLEAR.substr(0, 6 - percent.length) + percent;
    return process.stdout.write(' ['.grey + BAR.substr(0, rounded).bold.green + NOBAR.substr(0, 50 - rounded) + '] '.grey + percent.bold.cyan + '%'.grey + '\r');
  };

  logerr = function(err) {
    process.stderr.write('Error: '.bold.red + (err.message || err) + '\n');
    return process.exit(1);
  };

  removeForwardSlash = function(path) {
    if (path.charAt(path.length - 1) === '/') {
      return path.substr(0, path.length - 1);
    } else {
      return path;
    }
  };

  getAnnounce = function(options) {
    var announce, announceList, url, _i, _len, _ref;
    if (!options.announceList) return null;
    if (options.announceList.length > 1) {
      announce = options.announceList.shift();
      announceList = [];
      _ref = options.announceList;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        url = _ref[_i];
        announceList.push([url]);
      }
      options.announceList = announceList;
    } else {
      announce = options.announceList[0];
      delete options.announceList;
    }
    return announce;
  };

  switch (options.action) {
    case 'make':
      if (!options.announceList) logerr('Must provide at least one announce URL');
      dir = './';
      folder = null;
      removeFolder = function(path) {
        return path;
      };
      if (options.files.length === 1) {
        f = function(callback) {
          return fs.stat(options.files[0], function(err, stats) {
            if (err) return callback(err);
            if (stats.isDirectory()) {
              dir = options.files[0];
              folder = removeForwardSlash(options.files[0]);
              removeFolder = function(path) {
                return path.split('/').slice(1).join('/');
              };
            }
            return callback();
          });
        };
      } else {
        f = function(callback) {
          return callback();
        };
      }
      funs = [f];
      _ref = options.files;
      _fn = function(file) {
        return funs.push(function(callback) {
          return path.exists(file, function(exists) {
            var emitter, files;
            if (!exists) return callback(new Error("" + file + " does not exist"));
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
        });
      };
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        file = _ref[_i];
        _fn(file);
      }
      async.parallel(funs, function(err, results) {
        var announce, filename, r, _j, _len2;
        if (err) return logerr(err);
        options.files = [];
        results = results.slice(1);
        for (_j = 0, _len2 = results.length; _j < _len2; _j++) {
          r = results[_j];
          options.files = options.files.concat(r);
        }
        if (options.files.length === 0) return logerr('No files to add');
        filename = options.output || options.name || folder || options.files[0];
        if (path.extname(filename) !== '.torrent') filename += '.torrent';
        announce = getAnnounce(options);
        return nt.write(filename, announce, dir, options.files, options, function(err, emitter) {
          if (err) return logerr(err);
          console.time('Time taken');
          emitter.on('error', function(err) {
            return logerr(err);
          });
          emitter.on('progress', function(percent) {
            return progress(percent);
          });
          emitter.on('end', function() {
            console.log("\nFinished writing torrent at " + filename.bold);
            return console.timeEnd('Time taken');
          });
          return process.on('SIGINT', function() {
            emitter.stop();
            process.stdout.write('\n');
            return process.exit(1);
          });
        });
      });
      break;
    case 'edit':
      options.announce = getAnnounce(options);
      nt.edit(options.files[0], options, function(err, output) {
        if (err) logerr;
        return console.log("File written to " + output.bold);
      });
      break;
    case 'hash':
      nt.readFile(options.files[0], function(err, result) {
        if (err) logerr(err);
        return console.log(nt.getInfoHash(result));
      });
      break;
    case 'check':
      nt.readFile(options.files[0], function(err, result) {
        if (err) logerr(err);
        return nt.hashCheck(result, options.folder || './', options, function(err, emitter) {
          if (err) logerr(err);
          console.time('Time taken');
          emitter.on('error', function(err) {
            return logerr(err);
          });
          emitter.on('match', function(index, hash, percent) {
            return progress(percent);
          });
          emitter.on('end', function() {
            console.log("\nFinished hash checking torrent");
            return console.timeEnd('Time taken');
          });
          return process.on('SIGINT', function() {
            emitter.stop();
            process.stdout.write('\n');
            return process.exit(1);
          });
        });
      });
  }

}).call(this);
