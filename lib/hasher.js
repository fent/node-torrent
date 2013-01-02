var fs          = require('fs')
  , path        = require('path')
  , crypto      = require('crypto')
  , Stream      = require('stream').Stream
  , inherits    = require('util').inherits
  , async       = require('async')
  , _           = require('underscore')
  , streamspeed = require('streamspeed')
  , queue       = require('./queue')
  , util        = require('./util')
  , exists      = fs.exists || path.exists
  ;


/**
 * defaults
 * @const
 */
var MAX_FILES_OPENED = 250;


/**
 * Hashes a buffer.
 *
 * @param (Buffer) buffer
 * @return (Buffer)
 */
function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest();
}


/**
 * Rounds a number to given decimal place
 *
 * @param (number) num
 * @param (number) dec
 * @return (number)
 */
function round(num, dec) {
  var pow = Math.pow(10, dec);
  return Math.round(num * pow) / pow;
}


/**
 * Allows arrays of objects with a `path` property to be
 * sorted alphabetically
 *
 * @param (Object) obj
 * @return (string)
 */
 function sortByPath(obj) {
   return obj.path.join();
 }


/**
 * Calculates piece hashes of file list
 *
 * @param (string) dir Directory where files are.
 * @param (Array.string) list Array of files to hash.
 * @param (number) pieceLength How many bytes long each piece will be.
 * @param options
 * @param options.maxFiles Max number of files to open during hashing.
 * @param options.stopOnErr Hashing stops if encounters an error.
 * @constructor
 * @extends Stream
 * @api private
 */
var Hasher = module.exports = function(dir, list, pieceLength, options) {
  if (options == null) options = {};
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // set defaults
  this.maxFiles  = options.maxFiles || MAX_FILES_OPENED;
  this.stopOnErr = options.stopOnErr || false;

  // init arrays that will be used every time during hashing
  this.dir             = dir;
  this.pieceLength     = pieceLength;
  this.files           = [];
  this.pieces          = [];
  this.ready           = false;
  this.hashing         = false;
  this.paused          = false;
  this.stopped         = false;

  var self = this;

  if (self.stopOnErr) {
    self.once('error', function(err) {
      self.err = err;
    });
  }

  exists(dir, function(exists) {
    if (!exists) {
      return self.emit('error', new Error(dir + ' does not exist'));
    }

    // Check if list containts objects or strings.
    if (typeof list[0] === 'string') {

      // create queue to handle having many files opened
      var statqueue = queue(fs.stat, self.maxFiles);
      self._getFilesStats(statqueue, list, readTasks);

    // in the case of objects, a file list from a torrent file was given.
    } else {
      self.files = list;
      process.nextTick(readTasks);
    }

    function readTasks(err) {
      // sort files alphabetically
      self.files     = _.sortBy(self.files, sortByPath);

      if (err) return self.emit('error', err);

      // if files tree traversed with no errors,
      // add read tasks to filetasks
      self._CreateFileTasks();

      // ready to start hashing
      self.emit('ready');
      self.ready = true;
      self._start();
    }
  });
};

inherits(Hasher, Stream);


/**
 * Create filetasks array
 */
Hasher.prototype._CreateFileTasks = function() {
  var self = this;

  // variables to help calculate piece position
  var totalSize, piece, offset;
  totalSize = piece = offset = 0;

  // Create tasks to figure out what pieces belong to exactly
  // what files and what part of the files
  self.filetasks = [];
  self.files.forEach(function(task) {

    self.filetasks.push({
      length : task.length
    , path   : task.path
      // piece this task will write to
    , piece    : piece
      // piece buffer offset to start writing at
    , offset   : offset
    });

    // add file length to total size
    totalSize += task.length;

    // get piece next task will write to and its offset
    piece = Math.floor(totalSize / self.pieceLength);
    offset = totalSize - (self.pieceLength * piece);
  });

  self.totalSize = totalSize;
  self.pieces = piece + 1;
  // take note of the length of the last piece
  // the rest of the pieces will be of self.pieceLength length
  self.lastPieceLength = totalSize - (self.pieceLength * piece);
};


/**
 * Starts the actual hashing process
 */
Hasher.prototype._start = function() {
  var self = this;
  if (!self.ready) {
    return self.emit('error', new Error('Cannot start before being ready'));
  }
  self.hashing = true;
  self.stopped = false;

  // create piece objects
  var pieces = [];
  for (var i = 0; i < self.pieces; i++) {
    pieces[i] = {
      buffer: null
    , length: self.pieceLength
    , bytesWritten: 0
    };
  }
  pieces[pieces.length - 1].length = self.lastPieceLength;

 
  // keep track of progress
  var totalRead = 0;

  // keep track of reading speed
  self.streamGroup = new streamspeed.Group();
  var lastPercent = 0
    , speed = 0
    , avg = 0
  self.streamGroup.on('readspeed', function(s, a) {
    speed = s;
    avg   = a;
  });

  var filesqueue = queue(function(task, callback) {
    if (self.err || self.stopped) return callback();

    // keep track how much has been read
    var readSoFar   = 0
      , pieceIndex = task.piece

    // open file for reading
    var file = path.join(self.dir, path.join.apply(null, task.path));
    var rs = fs.createReadStream(file);
    self.streamGroup.watch(rs);

    rs.on('open', function() {
      self.emit('open', file);
    });

    rs.on('data', function(data) {
      // recalculate the index of current piece based on readSoFar
      pieceIndex = task.piece + Math.floor((task.offset + readSoFar) / self.pieceLength);

      // write data to piece buffer
      var targetStart = (task.offset + readSoFar) % self.pieceLength;
      var sourceWritten = self._writePiece(
          pieces, pieceIndex, targetStart,
          data, 0, data.length, file, readSoFar);

      while (sourceWritten < data.length) {
        pieceIndex += 1;
        sourceWritten += self._writePiece(
            pieces, pieceIndex, 0,
            data, sourceWritten, data.length, file, readSoFar);
      }

      // update amount of bytes written to buffer
      readSoFar += data.length;
      totalRead += data.length;

      // emit hash event with piece info and progress
      var percent =
        round(totalRead / self.totalSize * 100, 2);
      if (lastPercent !== percent) {
        self.emit('progress', percent, speed, avg);
        lastPercent = percent;
      }

    });

    // close this file when there is an error or finished reading
    rs.on('error', function(err) {
      self.emit('error', err);
      callback();
    });

    rs.on('end', function() {
      callback();
    });
  }, self.maxFiles);

  // when all file queues are finished,
  // join all the pieces
  filesqueue.drain = function() {
    self.hashing = false;
    self.emit('end');
  };

  // start queueing jobs
  self.filetasks.forEach(function(filetask) {
    filesqueue.push(filetask);
  });
};


Hasher.prototype._writePiece = function(pieces, index, offset,
                                       data, start, end,
                                       file, readSoFar) {
  var piece = pieces[index];
  if (!piece) return;
  if (piece.buffer === null) {
    piece.buffer = new Buffer(piece.length);
  }

  // write data to piece buffer and update bytes written
  var size = Math.min(end - start, piece.length - offset);
  piece.bytesWritten += size;
  data.copy(piece.buffer, offset, start, start + size);

  // check if piece buffer is full
  if (piece.bytesWritten == piece.length) {
    pieces[index] = null;
    var buf = new Buffer(sha1(piece.buffer), 'binary');
    this.emit('hash', index, buf, file, readSoFar, size);
  }

  return size;
};


/**
 * Recursively traverses files to call fs.stat on them.
 * Will add all files in folders if any are encountered.
 *
 * @param (Array.string) list List of files and/or directories.
 * @param (function(err)) callback
 */
Hasher.prototype._getFilesStats = function(queue, list, callback) {
  var self = this;
  var funs = [];

  list.forEach(function(file, i) {
    funs[i] = function(callback) {
      self._getFileStat(queue, file, callback);
    };
  });

  // read all file stats in parallel
  async.parallel(funs, callback);
};


/**
 * Stat is needed to know file size.
 *
 * @param (string) dir
 * @param (Array.string) list
 */
Hasher.prototype._getFileStat = function(queue, file, callback) {
  var self = this;
  var filepath = path.join(self.dir, file);

  queue.push(filepath, function(err, stat) {
    if (err) return callback(err);

    // if this is a directory, add all files in it to torrent files
    if (stat.isDirectory()) {
      fs.readdir(filepath, function(err, dirfiles) {
        if (err) return callback(err);

        dirfiles = dirfiles.map(function(dirfile) {
          return path.join(file, dirfile);
        });
        // call _getFilesStats again
        self._getFilesStats(queue, dirfiles, callback);
      });

    } else if (stat.isFile()) {

      self.files.push({
        length: stat.size
      , path: util.splitPath(file)
      });
      callback(null);
    }
  });
};


/**
 * Allows pausing of the hashing process by storing functions from the
 * file and read queues that will not get called back until resume()
 * is called.
 */
Hasher.prototype.pause = function() {
  if (this.paused || !this.hashing) return false;
  this.paused = true;

  this.streamGroup.getStreams().forEach(function(rs) {
    rs.pause();
  });

  return true;
};


/**
 * Resumes hashing
 */
Hasher.prototype.resume = function() {
  if (!this.paused) return false;
  this.paused = false;
  
  this.streamGroup.getStreams().forEach(function(rs) {
    rs.resume();
  });

  return true;
};


/**
 * Continues hashing if paused or pauses if not
 */
Hasher.prototype.toggle = function() {
  return this.paused ? this.resume() : this.pause();
};


/**
 * Stops hashing completely.
 * Closes file descriptors and does not emit any more events.
 */
Hasher.prototype.destroy = function() {
  if (!this.hashing) return false;
  this.stopped = true;
  this.paused = false;

  this.streamGroup.getStreams().forEach(function(rs) {
    rs.destroy();
  });

  return true;
};
