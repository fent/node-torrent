import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Stream } from 'node:stream';
import { parallel } from 'async';
import StreamSpeed from 'streamspeed';

import queue, { type Queue } from './queue';
import * as util from './util';

/**
 * defaults
 */
const PIECE_LENGTH = 262144; // 256kb
const MAX_FILES_OPENED = 250;

/**
 * Hashes a buffer.
 */
const sha1 = (buffer: Buffer): Buffer => {
  return crypto.createHash('sha1').update(buffer).digest();
};

/**
 * Rounds a number to given decimal place.
 */
const round = (num: number, dec: number): number => {
  const pow = 10 ** dec;
  return Math.round(num * pow) / pow;
};

export interface FileEntry {
  length: number;
  path: string[];
  md5sum?: string;
}

export interface FileTask extends FileEntry {
  piece: number;
  offset: number;
}

export interface PieceBuffer {
  buffer: Buffer | null;
  length: number;
  bytesWritten: number;
}

export interface HasherOptions {
  maxFiles?: number;
  stopOnErr?: boolean;
}

/**
 * Allows arrays of objects with a `path` property to be
 * sorted alphabetically
 */
const sortByPath = (a: FileEntry, b: FileEntry): number => {
  const len = Math.min(a.path.length, b.path.length);
  for (let i = 0; i < len; i++) {
    if (a.path[i] < b.path[i]) return -1;
    if (a.path[i] > b.path[i]) return 1;
  }
  return a.path.length - b.path.length;
};

export default class Hasher extends Stream {
  public pieceLength: number;
  public maxFiles: number;
  public stopOnErr: boolean;
  public dir: string;
  public files: FileEntry[];
  public pieces: number;
  public ready: boolean;
  public hashing: boolean;
  public paused: boolean;
  public stopped: boolean;
  public readable: boolean;
  public err?: Error;
  public filetasks: FileTask[];
  public totalSize: number;
  public lastPieceLength: number;
  public streamGroup: StreamSpeed;

  /**
   * Calculates piece hashes of file list.
   */
  constructor(
    dir: string,
    list: string[] | FileEntry[],
    pieceLength?: number | null,
    options?: HasherOptions,
  ) {
    super();
    options = options || {};

    // Set defaults.
    this.pieceLength = pieceLength || PIECE_LENGTH;
    this.maxFiles = options.maxFiles || MAX_FILES_OPENED;
    this.stopOnErr = options.stopOnErr || false;

    // Init arrays that will be used every time during hashing.
    this.dir = dir;
    this.files = [];
    this.pieces = 0;
    this.ready = false;
    this.hashing = false;
    this.paused = false;
    this.stopped = false;
    this.readable = false;
    this.filetasks = [];
    this.totalSize = 0;
    this.lastPieceLength = 0;
    this.streamGroup = new StreamSpeed();

    if (this.stopOnErr) {
      this.once('error', (err: Error) => {
        this.err = err;
      });
    }

    fs.access(dir, (err) => {
      if (err) {
        return this.emit('error', err);
      }

      const fromDisk = typeof list[0] === 'string';

      const readTasks = (readErr?: Error | null) => {
        // Create shallow copy of the files array.
        this.files = Array.from(this.files);

        // When creating a torrent from files on disk, sort them alphabetically.
        // File lists from an existing torrent must keep their original order,
        // since the piece hashes depend on it, so they are not sorted.
        if (fromDisk) {
          this.files.sort(sortByPath);
        }

        if (readErr) return this.emit('error', readErr);

        // If files tree traversed with no errors,
        // add read tasks to filetasks.
        this._CreateFileTasks();

        // Ready to start hashing.
        this.ready = true;
        this.emit('ready');
        this.ready = true;
        this._start();
      };

      // Check if list contains objects or strings.
      if (fromDisk) {
        // Create queue to handle having many files opened.
        const statqueue = queue<string, fs.Stats>((filepath, cb) => {
          fs.stat(filepath, cb);
        }, this.maxFiles);
        this._getFilesStats(statqueue, list as string[], readTasks);

        // In the case of objects, a file list from a torrent file was given.
      } else {
        this.files = list as FileEntry[];
        process.nextTick(readTasks);
      }
    });
  }

  /**
   * Create filetasks array
   */
  _CreateFileTasks(): void {
    // Variables to help calculate piece position.
    let totalSize = 0;
    let piece = 0;
    let offset = 0;

    // Create tasks to figure out what pieces belong to exactly
    // what files and what part of the files.
    this.filetasks = [];
    this.files.forEach((task) => {
      this.filetasks.push({
        length: task.length,
        path: task.path,
        // Piece this task will read from or write to.
        piece,
        // Piece buffer offset to start reading or writing at.
        offset,
      });

      // Add file length to total size.
      totalSize += task.length;

      // Get piece next task will write to and its offset.
      piece = Math.floor(totalSize / this.pieceLength);
      offset = totalSize - this.pieceLength * piece;
    });

    this.totalSize = totalSize;
    this.pieces = piece + 1;
    // Take note of the length of the last piece.
    // The rest of the pieces will be of `this.pieceLength` length.
    this.lastPieceLength = totalSize - this.pieceLength * piece;
  }

  /**
   * Starts hashing.
   */
  _start(): void {
    if (!this.ready) {
      this.emit('error', new Error('Cannot start before being ready'));
      return;
    }
    this.hashing = true;
    this.stopped = false;

    // Create piece objects.
    const pieces: Array<PieceBuffer | null> = [];
    for (let i = 0; i < this.pieces; i++) {
      pieces[i] = {
        buffer: null,
        length: this.pieceLength,
        bytesWritten: 0,
      };
    }
    const lastPiece = pieces[pieces.length - 1];
    if (lastPiece) {
      lastPiece.length = this.lastPieceLength;
    }

    // Keep track of progress.
    let totalRead = 0;

    // Keep track of reading speed.
    this.streamGroup = new StreamSpeed();
    let lastPercent = 0;
    let speed = 0;
    let avg = 0;

    this.streamGroup.on('speed', (s: number, a: number) => {
      speed = s;
      avg = a;
    });

    const filesqueue = queue<FileTask>((task, callback) => {
      if (this.err || this.stopped) return callback();

      // Keep track how much has been read.
      let readSoFar = 0;
      let pieceIndex = task.piece;

      // Open file for reading.
      const baseDir = path.resolve(this.dir);
      const file = path.resolve(baseDir, ...task.path);
      const relative = path.relative(baseDir, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        this.emit('error', new Error(`Path traversal detected: ${file}`));
        return callback();
      }
      const rs = fs.createReadStream(file);
      this.streamGroup.add(rs);

      rs.on('open', () => {
        this.emit('open', file);
      });

      rs.on('data', (chunk: string | Buffer) => {
        const data = chunk as Buffer;

        // Recalculate the index of current piece based on `readSoFar`.
        pieceIndex =
          task.piece + Math.floor((task.offset + readSoFar) / this.pieceLength);

        // Write data to piece buffer.
        const targetStart = (task.offset + readSoFar) % this.pieceLength;
        let sourceWritten = this._writePiece(
          pieces,
          pieceIndex,
          targetStart,
          data,
          0,
          data.length,
          file,
          readSoFar,
        );

        while (sourceWritten < data.length) {
          pieceIndex += 1;
          sourceWritten += this._writePiece(
            pieces,
            pieceIndex,
            0,
            data,
            sourceWritten,
            data.length,
            file,
            readSoFar,
          );
        }

        // Update amount of bytes written to buffer.
        readSoFar += data.length;
        totalRead += data.length;

        // Emit hash event with piece info and progress.
        const percent = round((totalRead / this.totalSize) * 100, 2);
        if (lastPercent !== percent) {
          this.emit('progress', percent, speed, avg);
          lastPercent = percent;
        }
      });

      // Close this file when there is an error or finished reading.
      rs.on('error', (err: Error) => {
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

  _writePiece(
    pieces: Array<PieceBuffer | null>,
    index: number,
    offset: number,
    data: Buffer,
    start: number,
    end: number,
    file?: string,
    readSoFar?: number,
  ): number {
    const piece = pieces[index];
    if (!piece) return 0;
    if (piece.buffer === null) {
      piece.buffer = Buffer.alloc(piece.length);
    }

    // Write data to piece buffer and update bytes written.
    const size = Math.min(end - start, piece.length - offset);
    piece.bytesWritten += size;
    data.copy(piece.buffer, offset, start, start + size);

    // Check if piece buffer is full.
    if (piece.bytesWritten === piece.length) {
      pieces[index] = null;
      const buf = Buffer.from(sha1(piece.buffer));
      this.emit('hash', index, buf, file, readSoFar, size);
    }

    return size;
  }

  /**
   * Recursively traverses files to call fs.stat on them.
   * Will add all files in folders if any are encountered.
   */
  _getFilesStats(
    statQueue: Queue<string, fs.Stats>,
    list: string[],
    callback: (err?: Error | null) => void,
  ): void {
    // Read all file stats in parallel.
    parallel(
      list.map((file) => {
        return this._getFileStat.bind(this, statQueue, file);
      }),
      callback,
    );
  }

  /**
   * Stat is needed to know file size.
   */
  _getFileStat(
    statQueue: Queue<string, fs.Stats>,
    file: string,
    callback: (err?: Error | null) => void,
  ): void {
    const filepath = path.join(this.dir, file);

    statQueue.push(filepath, (err?: Error | null, stat?: fs.Stats) => {
      if (err || !stat) return callback(err);

      // If this is a directory, add all files in it to torrent files.
      if (stat.isDirectory()) {
        fs.readdir(filepath, (readdirErr, dirfiles) => {
          if (readdirErr) return callback(readdirErr);

          const subfiles = dirfiles.map((dirfile) => path.join(file, dirfile));

          // Call _getFilesStats again.
          this._getFilesStats(statQueue, subfiles, callback);
        });
      } else if (stat.isFile()) {
        this.files.push({
          length: stat.size,
          path: util.splitPath(file),
        });
        callback(null);
      } else {
        callback(null);
      }
    });
  }

  /**
   * Allows pausing of the hashing process by storing functions from the
   * file and read queues that will not get called back until resume()
   * is called.
   */
  pause(): boolean {
    if (this.paused || !this.hashing) return false;
    this.paused = true;

    this.streamGroup.getStreams().forEach((rs) => {
      rs.pause();
    });

    return true;
  }

  /**
   * Resumes hashing.
   */
  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;

    this.streamGroup.getStreams().forEach((rs) => {
      rs.resume();
    });

    return true;
  }

  /**
   * Continues hashing if paused or pauses if not.
   */
  toggle(): boolean {
    return this.paused ? this.resume() : this.pause();
  }

  /**
   * Stops hashing completely.
   * Closes file descriptors and does not emit any more events.
   */
  destroy(): boolean {
    if (!this.hashing) return false;
    this.hashing = false;
    this.stopped = true;
    this.paused = false;

    this.streamGroup.getStreams().forEach((rs) => {
      rs.destroy();
    });

    return true;
  }
}
