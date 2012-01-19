var fs           = require('fs')
  , path         = require('path')
  , crypto       = require('crypto')
  , EventEmitter = require('events').EventEmitter
  , inherits     = require('util').inherits
  , Buffers      = require('buffers')
  , async        = require('async')
  , _            = require('underscore')
  , queue        = require('./queue')
  , util         = require('./util')


/**
 * defaults
 * @const
 */
var MAX_FILES_OPENED    = 250
  , MAX_BYTES_ALLOCATED = 536870912


/**
 * Hashes a buffer.
 * @param (Buffer) buffer
 * @return (Buffer)
 */
function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest();
}


/**
 * Rounds a number to given decimal place
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
 * @param (Object) obj
 * @return (string)
 */
 function sortByPath(obj) {
   return obj.path.join();
 }


/**
 * Calculates piece hashes of file list
 * @param (string) dir Directory where files are.
 * @param (Array.string) list Array of files to hash.
 * @param (number) pieceLength How many bytes long each piece will be.
 * @param options
 * @param options.maxFiles Max number of files to open during hashing.
 * @param options.maxBytes Max number of bytes to allocate during hashing.
 * @param options.stopOnErr Hashing stops if encounters an error.
 * @constructor
 * @extends EventEmitter
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
  this.maxBytes  = options.maxBytes || MAX_BYTES_ALLOCATED;
  this.stopOnErr = options.stopOnErr || false;

  // init arrays that will be used every time during hashing
  this.dir             = dir;
  this.pieceLength     = pieceLength;
  this.files           = [];
  this.filetasks       = [];
  this.pieces          = [];
  this.ready           = false;
  this.hashing         = false;
  this.paused          = false;
  this.pausedEvents    = [];
  this.pausedCallbacks = [];
  this.stopped         = false;

  var self = this;

  if (self.stopOnErr) {
    self.once('error', function(err) {
      self.err = err;
    });
  }

  path.exists(dir, function(exists) {
    if (!exists) {
      return self.emit('error', new Error(dir + ' does not exist'));
    }

    // Check if list containts objects or strings.
    if (typeof list[0] === 'string') {

      // create queue to handle having many files opened
      var statqueue = queue(fs.stat, MAX_FILES_OPENED);
      self.getFilesStats(statqueue, list, readTasks);

    // in the case of objects, a file list from a torrent file was given.
    } else {
      self.files = list;
      list.forEach(function(file) {
        self.filetasks.push({
          path      : file.path
        , length    : file.length
        , readtasks : []
        });
      });
      process.nextTick(readTasks);
    }

    function readTasks(err) {
      // sort files alphabetically
      self.files     = _.sortBy(self.files, sortByPath);
      self.filetasks = _.sortBy(self.filetasks, sortByPath);

      if (err) return self.emit('error', err);

      // if files tree traversed with no errors,
      // add read tasks to filetasks
      self.addReadTasks();

      // ready to start hashing
      self.emit('ready');
      self.ready = true;
      self.start();
    }
  });
};

inherits(Hasher, EventEmitter);


/**
 * Add readtasks to the filetasks array
 */
Hasher.prototype.addReadTasks = function() {
  var self = this;

  // variables to help calculate piece position
  var totalSize, piece, offset;
  totalSize = piece = offset = 0;

  // Create tasks to figure out what pieces belong to exactly
  // what files and what part of the files
  self.filetasks.forEach(function(task) {
    // keep track of file position and start "reading"
    var position = 0
      , bytesLeft = task.length

    while (0 !== bytesLeft) {
      // calculate how much will be read in this task
      var length = Math.min(bytesLeft, self.pieceLength);
      if (length > offset) length -= offset;
      bytesLeft -= length;

     // make new readtask for this filetask
      task.readtasks.push({
        // piece this task will write to
        piece    : piece
        // piece buffer offset to start writing at
      , offset   : offset
        // amount of bytes to read from file and write to buffer
      , length   : length
        // where to start reading in file
      , position : position
      });

      // update bytes left to read
      totalSize += length;
      position += length;

      // get piece next task will write to and its offset
      piece = Math.floor(totalSize / self.pieceLength);
      offset = totalSize % self.pieceLength;
    }
  });

  self.pieces = piece + 1;
  // take note of the length of the last piece
  // the rest of the pieces will be of self.pieceLength length
  self.lastPieceLength = totalSize % self.pieceLength;
};


/**
 * Starts the actual hashing process
 */
Hasher.prototype.start = function() {
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
    };
  }
  pieces[pieces.length - 1].length = self.lastPieceLength;

 
  // keep track of progress
  var piecesHashed = 0;

  // keep track of how many read tasks are running
  // and the memory used by them
  var bytesAllocated = 0;
  var checkBytes = function(workers, readtask) {
    return bytesAllocated + readtask.length < self.maxBytes;
  };

  var filesqueue = queue(function(filetask, callback) {

    // open file for reading
    fs.open(path.join(self.dir, path.join.apply(null, filetask.path)),
            'r', 0666, function(err, fd) {
      if (self.err || self.stopped) return callback();
      if (err) {
        self.emit('err', err);
        return callback();
      }
      self.emit('open', filetask.file);

      // create queue for memmory usage
      var readqueue = queue(function(readtask, callback) {
        bytesAllocated += readtask.length;

        // check if piece has been written to already.
        // if not, make object for it
        if (!pieces[readtask.piece].buffer) {
          pieces[readtask.piece].buffer =
            new Buffer(pieces[readtask.piece].length);
        }

        // read file
        fs.read(readtask.fd, pieces[readtask.piece].buffer,
                readtask.offset, readtask.length, readtask.position,
                function(err, bytesRead, buffer) {
          if (self.err || self.stopped) return callback();
          if (err) {
            self.emit('error', err);
            return callback();
          }

          // update amount of bytes written to buffer
          pieces[readtask.piece].length -= readtask.length;

          // check if buffer is full, if it is, generate hash
          if (pieces[readtask.piece].length === 0) {
            var length = pieces[readtask.piece].buffer.length;
            pieces[readtask.piece] =
              new Buffer(sha1(pieces[readtask.piece].buffer), 'binary');

            // emit hash event with piece info and progress
            var percent =
              round(++piecesHashed / pieces.length * 100, 2);

            var args = ['hash', readtask.piece, pieces[readtask.piece],
                        percent, filetask.file, readtask.position,
                        readtask.length];
            if (self.paused) {
              self.pausedEvents.push(args);
            } else {
              self.emit.apply(self, args);
            }

            // free up memory
            bytesAllocated -= length;
          }

          // free up queue when finished reading
          if (self.paused) {
            self.pausedCallbacks.push(callback);
          } else {
            callback();
          }
        });
      }, checkBytes);

      // close this file when queue finishes
      readqueue.drain = function() {
        fs.close(fd, function(err) {
          if (err) self.emit('error', err);
          self.emit('close', filetask.file);
        });
        callback();
      };

      // queue up tasks for reading file asynchronously
      filetask.readtasks.forEach(function(readtask) {
        // add fd to task object to reference in worker
        readtask.fd   = fd;
        readqueue.push(readtask);
      });
    });
  }, self.maxFiles);

  // when all file queues are finished,
  // join all the pieces
  filesqueue.drain = function() {
    var buf = Buffers();
    pieces.forEach(function(p) {
      buf.push(p);
    });
    self.hashing = false;
    self.emit('end', buf.toBuffer());
  };

  // start queueing jobs
  self.filetasks.forEach(function(filetask) {
    filesqueue.push(filetask);
  });
};


/**
 * Recursively traverses files to call fs.stat on them.
 * Will add all files in folders if any are encountered.
 * @param (Array.string) list List of files and/or directories.
 * @param (function(err)) callback
 */
Hasher.prototype.getFilesStats = function(queue, list, callback) {
  var self = this;
  var funs = [];

  list.forEach(function(file, i) {
    funs[i] = function(callback) {
      self.getFileStat(queue, file, callback);
    };
  });

  // read all file stats in parallel
  async.parallel(funs, callback);
 }


/**
 * stat is needed to know file size.
 * @param (string) dir
 * @param (Array.string) list
 */
Hasher.prototype.getFileStat = function(queue, file, callback) {
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
        // call getFilesStats again
        self.getFilesStats(queue, dirfiles, callback);
      });

    } else if (stat.isFile()) {

      var splitpath = util.splitPath(file);
      self.files.push({
        length: stat.size
      , path: splitpath
      });
      self.filetasks.push({
        path: splitpath
      , length: stat.size
      , readtasks: []
      });
      callback(null);
    }
  });
 }


 /**
 * Allows pausing of the hashing process by storing functions from the
 * file and read queues that will not get called back until resume()
 * is called.
 */
Hasher.prototype.pause = function() {
  if (this.paused || !this.hashing) return;
  this.paused = true;
};


 /**
 * Resumes hashing
 */
Hasher.prototype.resume = function() {
  if (!this.paused) return;
  this.paused = false;
  
  var event;
  while(event = this.pausedEvents.shift()) {
    this.emit.apply(this, event);
  }

  var fn;
  while (fn = this.pausedCallbacks.shift()) {
    fn();
  }
};


/**
 * Stops hashing completely.
 * Closes file descriptors and does not emit any more events.
 */
Hasher.prototype.destroy = function() {
  if (!this.hashing) return;
  this.stopped = true;
};


/**
 * Aliases destroy.
 */
 Hasher.prototype.stop = Hasher.prototype.destroy;
