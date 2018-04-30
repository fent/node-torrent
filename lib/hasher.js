const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const Stream      = require('stream').Stream;
const parallel    = require('async').parallel;
const _           = require('underscore');
const StreamSpeed = require('streamspeed');

const queue       = require('./queue');
const util        = require('./util');


/**
 * defaults
 */
const PIECE_LENGTH = 262144; // 256kb
const MAX_FILES_OPENED = 250;


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


module.exports = class Hasher extends Stream {
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
  constructor(dir, list, pieceLength, options) {
    super();
    options = options || {};

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

    if (this.stopOnErr) {
      this.once('error', (err) => {
        this.err = err;
      });
    }

    fs.access(dir, (err) => {
      if (err) {
        return this.emit('error', err);
      }

      var readTasks = (err) => {
        // Sort files alphabetically.
        this.files = _.sortBy(this.files, sortByPath);

        if (err) return this.emit('error', err);

        // If files tree traversed with no errors,
        // add read tasks to filetasks.
        this._CreateFileTasks();

        // Ready to start hashing.
        this.ready = true;
        this.emit('ready');
        this.ready = true;
        this._start();
      };

      // Check if list containts objects or strings.
      if (typeof list[0] === 'string') {

        // Create queue to handle having many files opened.
        var statqueue = queue(fs.stat, this.maxFiles);
        this._getFilesStats(statqueue, list, readTasks);

      // In the case of objects, a file list from a torrent file was given.
      } else {
        this.files = list;
        process.nextTick(readTasks);
      }
    });
  }


  /**
   * Create filetasks array
   */
  _CreateFileTasks() {
    // Variables to help calculate piece position.
    var totalSize, piece, offset;
    totalSize = piece = offset = 0;

    // Create tasks to figure out what pieces belong to exactly
    // what files and what part of the files.
    this.filetasks = [];
    this.files.forEach((task) => {

      this.filetasks.push({
        length : task.length,
        path   : task.path,
        // Piece this task will write to.
        piece,
        // Piece buffer offset to start writing at.
        offset,
      });

      // Add file length to total size.
      totalSize += task.length;

      // Get piece next task will write to and its offset.
      piece = Math.floor(totalSize / this.pieceLength);
      offset = totalSize - (this.pieceLength * piece);
    });

    this.totalSize = totalSize;
    this.pieces = piece + 1;
    // Take note of the length of the last piece.
    // The rest of the pieces will be of `this.pieceLength` length.
    this.lastPieceLength = totalSize - (this.pieceLength * piece);
  }


  /**
   * Starts the actual hashing process
   */
  _start() {
    if (!this.ready) {
      return this.emit('error', new Error('Cannot start before being ready'));
    }
    this.hashing = true;
    this.stopped = false;

    // Create piece objects.
    var pieces = [];
    for (var i = 0; i < this.pieces; i++) {
      pieces[i] = {
        buffer       : null,
        length       : this.pieceLength,
        bytesWritten : 0,
      };
    }
    pieces[pieces.length - 1].length = this.lastPieceLength;

   
    // Keep track of progress.
    var totalRead = 0;

    // Keep track of reading speed.
    this.streamGroup = new StreamSpeed();
    var lastPercent = 0;
    var speed = 0;
    var avg = 0;

    this.streamGroup.on('speed', (s, a) => {
      speed = s;
      avg   = a;
    });

    var filesqueue = queue((task, callback) => {
      if (this.err || this.stopped) return callback();

      // Keep track how much has been read.
      var readSoFar  = 0;
      var pieceIndex = task.piece;

      // Open file for reading.
      var file = path.join(this.dir, path.join.apply(null, task.path));
      var rs = fs.createReadStream(file);
      this.streamGroup.add(rs);

      rs.on('open', () => {
        this.emit('open', file);
      });

      rs.on('data', (data) => {
        // Recalculate the index of current piece based on `readSoFar`.
        pieceIndex = task.piece +
          Math.floor((task.offset + readSoFar) / this.pieceLength);

        // Write data to piece buffer.
        var targetStart = (task.offset + readSoFar) % this.pieceLength;
        var sourceWritten = this._writePiece(
          pieces, pieceIndex, targetStart,
          data, 0, data.length, file, readSoFar);

        while (sourceWritten < data.length) {
          pieceIndex += 1;
          sourceWritten += this._writePiece(
            pieces, pieceIndex, 0,
            data, sourceWritten, data.length, file, readSoFar);
        }

        // Update amount of bytes written to buffer.
        readSoFar += data.length;
        totalRead += data.length;

        // Emit hash event with piece info and progress.
        var percent =
          round(totalRead / this.totalSize * 100, 2);
        if (lastPercent !== percent) {
          this.emit('progress', percent, speed, avg);
          lastPercent = percent;
        }

      });

      // Close this file when there is an error or finished reading.
      rs.on('error', (err) => {
        this.emit('error', err);
        callback();
      });

      rs.on('end', () => {
        callback();
      });
    }, this.maxFiles);

    // When all file queues are finished, join all the pieces.
    filesqueue.drain = () => {
      this.hashing = false;
      this.emit('end');
    };

    // Start queueing jobs.
    this.filetasks.forEach((filetask) => {
      filesqueue.push(filetask);
    });
  }


  _writePiece(pieces, index, offset,
    data, start, end,
    file, readSoFar) {
    var piece = pieces[index];
    if (!piece) return;
    if (piece.buffer === null) {
      piece.buffer = Buffer.alloc(piece.length);
    }

    // Write data to piece buffer and update bytes written.
    var size = Math.min(end - start, piece.length - offset);
    piece.bytesWritten += size;
    data.copy(piece.buffer, offset, start, start + size);

    // Check if piece buffer is full.
    if (piece.bytesWritten === piece.length) {
      pieces[index] = null;
      var buf = Buffer.from(sha1(piece.buffer), 'binary');
      this.emit('hash', index, buf, file, readSoFar, size);
    }

    return size;
  }


  /**
   * Recursively traverses files to call fs.stat on them.
   * Will add all files in folders if any are encountered.
   *
   * @param {Boolean} queue
   * @param {Array.<String>} list List of files and/or directories.
   * @param {function(!Error)} callback
   */
  _getFilesStats(queue, list, callback) {
    // Read all file stats in parallel.
    parallel(list.map((file) => {
      return this._getFileStat.bind(this, queue, file);
    }), callback);
  }


  /**
   * Stat is needed to know file size.
   *
   * @param {Boolean} queue
   * @param {Array.<String>} list List of files and/or directories.
   * @param {function(!Error)} callback
   */
  _getFileStat(queue, file, callback) {
    var filepath = path.join(this.dir, file);

    queue.push(filepath, (err, stat) => {
      if (err) return callback(err);

      // If this is a directory, add all files in it to torrent files.
      if (stat.isDirectory()) {
        fs.readdir(filepath, (err, dirfiles) => {
          if (err) return callback(err);

          dirfiles = dirfiles.map(dirfile => path.join(file, dirfile));

          // Call _getFilesStats again.
          this._getFilesStats(queue, dirfiles, callback);
        });

      } else if (stat.isFile()) {

        this.files.push({
          length: stat.size,
          path: util.splitPath(file),
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
  pause() {
    if (this.paused || !this.hashing) return false;
    this.paused = true;

    this.streamGroup.getStreams().forEach((rs) => {
      rs.pause();
    });

    return true;
  }


  /**
   * Resumes hashing
   */
  resume() {
    if (!this.paused) return false;
    this.paused = false;
    
    this.streamGroup.getStreams().forEach((rs) => {
      rs.resume();
    });

    return true;
  }


  /**
   * Continues hashing if paused or pauses if not
   */
  toggle() {
    return this.paused ? this.resume() : this.pause();
  }


  /**
   * Stops hashing completely.
   * Closes file descriptors and does not emit any more events.
   */
  destroy() {
    if (!this.hashing) return false;
    this.stopped = true;
    this.paused = false;

    this.streamGroup.getStreams().forEach((rs) => {
      rs.destroy();
    });

    return true;
  }
};
