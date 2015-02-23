var fs          = require('fs');
var path        = require('path');
var crypto      = require('crypto');
var Stream      = require('stream').Stream;
var inherits    = require('util').inherits;
var async       = require('async');
var _           = require('underscore');
var StreamSpeed = require('streamspeed');

var queue       = require('./queue');
var util        = require('./util');
var exists      = fs.exists || path.exists;


/**
 * defaults
 * @const
 */
var PIECE_LENGTH = 262144; // 256kb
var MAX_FILES_OPENED = 250;


/**
 * Hashes a buffer.
 *
 * @param {Buffer} buffer
 * @return {Buffer}
 */
function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest();
}


/**
 * Rounds a number to given decimal place.
 *
 * @param {Number} num
 * @param {Number} dec
 * @return {Number}
 */
function round(num, dec) {
  var pow = Math.pow(10, dec);
  return Math.round(num * pow) / pow;
}


/**
 * Allows arrays of objects with a `path` property to be
 * sorted alphabetically
 *
 * @param {Object} obj
 * @return {String}
 */
 function sortByPath(obj) {
   return obj.path.join();
 }


/**
 * Calculates piece hashes of file list.
 *
 * @constructor
 * @param {String} dir Directory where files are.
 * @param {Array.<String>} list Array of files to hash.
 * @param {Number} pieceLength How many bytes long each piece will be.
 * @param {Object} options
 * @param   {Number} maxFiles Max number of files to open during hashing.
 * @param   {Boolean} stopOnErr Hashing stops if encounters an error.
 * @extends Stream
 */
var Hasher = module.exports = function(dir, list, pieceLength, options) {
  if (options == null) options = {};

  // Set defaults.
  this.pieceLength = pieceLength || PIECE_LENGTH;
  this.maxFiles    = options.maxFiles || MAX_FILES_OPENED;
  this.stopOnErr   = options.stopOnErr || false;

  // Init arrays that will be used every time during hashing.
  this.dir         = dir;
  this.files       = [];
  this.pieces      = [];
  this.ready       = false;
  this.hashing     = false;
  this.paused      = false;
  this.stopped     = false;

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

      // Create queue to handle having many files opened.
      var statqueue = queue(fs.stat, self.maxFiles);
      self._getFilesStats(statqueue, list, readTasks);

    // In the case of objects, a file list from a torrent file was given.
    } else {
      self.files = list;
      process.nextTick(readTasks);
    }

    function readTasks(err) {
      // Sort files alphabetically.
      self.files = _.sortBy(self.files, sortByPath);

      if (err) return self.emit('error', err);

      // If files tree traversed with no errors,
      // add read tasks to filetasks.
      self._CreateFileTasks();

      // Ready to start hashing.
      self.ready = true;
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

  // Variables to help calculate piece position.
  var totalSize, piece, offset;
  totalSize = piece = offset = 0;

  // Create tasks to figure out what pieces belong to exactly
  // what files and what part of the files.
  self.filetasks = [];
  self.files.forEach(function(task) {

    self.filetasks.push({
      length : task.length,
      path   : task.path,
      // Piece this task will write to.
      piece    : piece,
      // Piece buffer offset to start writing at.
      offset   : offset,
    });

    // Add file length to total size.
    totalSize += task.length;

    // Get piece next task will write to and its offset.
    piece = Math.floor(totalSize / self.pieceLength);
    offset = totalSize - (self.pieceLength * piece);
  });

  self.totalSize = totalSize;
  self.pieces = piece + 1;
  // Take note of the length of the last piece.
  // The rest of the pieces will be of `self.pieceLength` length.
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

  // Create piece objects.
  var pieces = [];
  for (var i = 0; i < self.pieces; i++) {
    pieces[i] = {
      buffer       : null,
      length       : self.pieceLength,
      bytesWritten : 0,
    };
  }
  pieces[pieces.length - 1].length = self.lastPieceLength;

 
  // Keep track of progress.
  var totalRead = 0;

  // Keep track of reading speed.
  self.streamGroup = new StreamSpeed();
  var lastPercent = 0;
  var speed = 0;
  var avg = 0;

  self.streamGroup.on('speed', function(s, a) {
    speed = s;
    avg   = a;
  });

  var filesqueue = queue(function(task, callback) {
    if (self.err || self.stopped) return callback();

    // Keep track how much has been read.
    var readSoFar  = 0;
    var pieceIndex = task.piece;

    // Open file for reading.
    var file = path.join(self.dir, path.join.apply(null, task.path));
    var rs = fs.createReadStream(file);
    self.streamGroup.add(rs);

    rs.on('open', function() {
      self.emit('open', file);
    });

    rs.on('data', function(data) {
      // Recalculate the index of current piece based on `readSoFar`.
      pieceIndex = task.piece +
        Math.floor((task.offset + readSoFar) / self.pieceLength);

      // Write data to piece buffer.
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

      // Update amount of bytes written to buffer.
      readSoFar += data.length;
      totalRead += data.length;

      // Emit hash event with piece info and progress.
      var percent =
        round(totalRead / self.totalSize * 100, 2);
      if (lastPercent !== percent) {
        self.emit('progress', percent, speed, avg);
        lastPercent = percent;
      }

    });

    // Close this file when there is an error or finished reading.
    rs.on('error', function(err) {
      self.emit('error', err);
      callback();
    });

    rs.on('end', function() {
      callback();
    });
  }, self.maxFiles);

  // When all file queues are finished, join all the pieces.
  filesqueue.drain = function() {
    self.hashing = false;
    self.emit('end');
  };

  // Start queueing jobs.
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

  // Write data to piece buffer and update bytes written.
  var size = Math.min(end - start, piece.length - offset);
  piece.bytesWritten += size;
  data.copy(piece.buffer, offset, start, start + size);

  // Check if piece buffer is full.
  if (piece.bytesWritten === piece.length) {
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
 * @param {Boolean} queue
 * @param {Array.<String>} list List of files and/or directories.
 * @param {function(!Error)} callback
 */
Hasher.prototype._getFilesStats = function(queue, list, callback) {
  // Read all file stats in parallel.
  var self = this;
  async.parallel(list.map(function(file) {
    return self._getFileStat.bind(self, queue, file);
  }), callback);
};


/**
 * Stat is needed to know file size.
 *
 * @param {Boolean} queue
 * @param {Array.<String>} list List of files and/or directories.
 * @param {function(!Error)} callback
 */
Hasher.prototype._getFileStat = function(queue, file, callback) {
  var self = this;
  var filepath = path.join(self.dir, file);

  queue.push(filepath, function(err, stat) {
    if (err) return callback(err);

    // If this is a directory, add all files in it to torrent files.
    if (stat.isDirectory()) {
      fs.readdir(filepath, function(err, dirfiles) {
        if (err) return callback(err);

        dirfiles = dirfiles.map(function(dirfile) {
          return path.join(file, dirfile);
        });
        // Call _getFilesStats again.
        self._getFilesStats(queue, dirfiles, callback);
      });

    } else if (stat.isFile()) {

      self.files.push({
        length: stat.size,
        path: util.splitPath(file),
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
