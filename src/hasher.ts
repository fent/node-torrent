import crypto from 'node:crypto';
import fs from 'node:fs';
import { IncomingMessage } from 'node:http';
import path from 'node:path';
import { type Readable, Stream } from 'node:stream';
import { parallel } from 'async';
import StreamSpeed from 'streamspeed';

import queue, { type Queue } from './queue';
import { isValidPathSegment } from './schema';
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

export interface StreamEntry {
  stream: Readable;
  /** Defaults to the stream's inferred path, or the torrent name. */
  path?: string | string[];
  length?: number;
}

export type HasherInput = string | FileEntry | Readable | StreamEntry;

export interface FileTask extends FileEntry {
  piece: number;
  offset: number;
  stream?: Readable;
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

export const isReadableStream = (val: unknown): val is Readable =>
  typeof val === 'object' &&
  val !== null &&
  typeof (val as Readable).pipe === 'function';

export const isStreamEntry = (val: unknown): val is StreamEntry =>
  typeof val === 'object' && val !== null && 'stream' in val;

/**
 * Infers a path from a stream that knows where its data comes from,
 * such as an `fs.ReadStream`.
 */
const inferStreamPath = (stream: Readable): string[] | null => {
  const streamPath = (stream as { path?: unknown }).path;
  if (typeof streamPath === 'string') return [path.basename(streamPath)];
  if (Buffer.isBuffer(streamPath)) {
    return [path.basename(streamPath.toString())];
  }
  return null;
};

const getReadStreamLength = (
  stream: fs.ReadStream,
): Promise<number | undefined> => {
  // A partially read stream no longer represents its full file.
  if (stream.bytesRead > 0 || !stream.path) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    fs.stat(stream.path as fs.PathLike, (err, stat) => {
      if (err || !stat.isFile()) {
        resolve(undefined);
        return;
      }

      const range = stream as fs.ReadStream & { start?: number; end?: number };
      const start = typeof range.start === 'number' ? range.start : 0;
      const end = Number.isFinite(range.end)
        ? (range.end as number)
        : stat.size - 1;
      const lastByte = Math.min(end, stat.size - 1);
      resolve(Math.max(0, lastByte - start + 1));
    });
  });
};

/**
 * Infers a stream's length when that information is cheap and reliable.
 * `fs.ReadStream` lengths come from the file size, adjusted for any
 * `start`/`end` range. HTTP responses can use `Content-Length`.
 */
const inferStreamLength = (stream: Readable): Promise<number | undefined> => {
  if (stream instanceof fs.ReadStream) return getReadStreamLength(stream);

  if (stream instanceof IncomingMessage) {
    const header = stream.headers['content-length'];
    if (typeof header === 'string') {
      const length = Number.parseInt(header, 10);
      if (Number.isInteger(length) && length >= 0) {
        return Promise.resolve(length);
      }
    }
  }

  return Promise.resolve(undefined);
};

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
  public unknownLengths: boolean;

  /**
   * Calculates piece hashes of file list.
   */
  constructor(
    dir: string,
    list: HasherInput[],
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
    this.unknownLengths = false;
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

    const isStreamInput = (item: unknown): item is Readable | StreamEntry =>
      isReadableStream(item) || isStreamEntry(item);
    const streamCount = list.filter(isStreamInput).length;

    // The piece order depends on the order of the input list, so mixing
    // streams with file paths would be ambiguous.
    if (streamCount > 0 && streamCount < list.length) {
      process.nextTick(() => {
        this.emit(
          'error',
          new Error('Cannot mix streams with file paths in the same list'),
        );
      });
      return;
    }

    if (streamCount > 0) {
      const baseName = path.basename(this.dir) || 'stream';
      const streamItems = (list as Array<Readable | StreamEntry>).map(
        (item) => {
          if (isStreamEntry(item)) {
            const rawPath = item.path;
            let itemPath: string[];
            if (rawPath == null) {
              itemPath = inferStreamPath(item.stream) ?? [baseName];
            } else if (Array.isArray(rawPath)) {
              itemPath = rawPath;
            } else {
              itemPath = util.splitPath(rawPath);
            }
            return {
              stream: item.stream,
              path: itemPath,
              length: item.length,
              autoNamed: rawPath == null,
            };
          }
          const streamPath = inferStreamPath(item) ?? [baseName];
          return {
            stream: item,
            path: streamPath,
            length: undefined,
            autoNamed: true,
          };
        },
      );

      // Validate paths and lengths before consuming any streams.
      for (const item of streamItems) {
        const label = item.path.join('/');
        if (
          item.path.length === 0 ||
          !item.path.every(
            (seg) =>
              typeof seg === 'string' && isValidPathSegment(Buffer.from(seg)),
          )
        ) {
          process.nextTick(() => {
            this.emit('error', new Error(`Path traversal detected: ${label}`));
          });
          return;
        }
        if (
          item.length !== undefined &&
          (!Number.isInteger(item.length) || item.length < 0)
        ) {
          process.nextTick(() => {
            this.emit(
              'error',
              new Error(
                `Invalid stream length for "${label}": must be a non-negative integer`,
              ),
            );
          });
          return;
        }
      }

      // Reserve explicitly named paths so generated names don't collide.
      const usedPaths = new Set<string>();
      for (const item of streamItems) {
        if (item.autoNamed) continue;
        const key = item.path.join('/');
        if (usedPaths.has(key)) {
          process.nextTick(() => {
            this.emit('error', new Error(`Duplicate stream path: ${key}`));
          });
          return;
        }
        usedPaths.add(key);
      }

      // Give unnamed streams unique names.
      for (const item of streamItems) {
        if (!item.autoNamed) continue;
        const basePath = item.path;
        let candidate = basePath;
        let suffix = 0;
        while (usedPaths.has(candidate.join('/'))) {
          suffix++;
          candidate = [
            ...basePath.slice(0, -1),
            `${basePath[basePath.length - 1]}-${suffix}`,
          ];
        }
        item.path = candidate;
        usedPaths.add(candidate.join('/'));
      }

      const begin = () => {
        if (streamItems.every((item) => typeof item.length === 'number')) {
          this.files = streamItems.map((item) => ({
            length: item.length as number,
            path: item.path,
          }));
          this._CreateFileTasks();
          streamItems.forEach((item, i) => {
            this.filetasks[i].stream = item.stream;
          });
          process.nextTick(() => {
            this.ready = true;
            this.emit('ready');
            this._start();
          });
        } else {
          this.unknownLengths = true;
          process.nextTick(() => {
            this.ready = true;
            this.emit('ready');
            this._startStreams(streamItems);
          });
        }
      };

      if (streamItems.some((item) => item.length === undefined)) {
        Promise.all(
          streamItems.map((item) =>
            item.length === undefined
              ? inferStreamLength(item.stream)
              : Promise.resolve(item.length),
          ),
        ).then((lengths) => {
          lengths.forEach((length, i) => {
            if (streamItems[i].length === undefined) {
              streamItems[i].length = length;
            }
          });
          begin();
        });
      } else {
        begin();
      }
      return;
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
    this.pieces = Math.ceil(totalSize / this.pieceLength);
    // The last piece holds the leftover bytes, or a full piece when the total
    // size divides evenly. A zero-byte torrent has no pieces.
    this.lastPieceLength =
      this.pieces === 0 ? 0 : totalSize - this.pieceLength * (this.pieces - 1);
  }

  /**
   * Starts the actual hashing process
   */
  _start(): void {
    if (!this.ready) {
      this.emit('error', new Error('Cannot start before being ready'));
      return;
    }
    // A ready listener may have reported an error, such as no files found.
    if (this.err) return;
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
      let finished = false;

      const finish = (err?: Error) => {
        if (finished) return;
        finished = true;
        if (err && !this.err) this.emit('error', err);
        callback();
      };

      // Open file for reading.
      const baseDir = path.resolve(this.dir);
      const file = path.resolve(baseDir, ...task.path);
      const relative = path.relative(baseDir, file);
      if (
        relative.startsWith('..') ||
        path.isAbsolute(relative) ||
        !task.path.every((seg) => isValidPathSegment(Buffer.from(seg)))
      ) {
        finish(new Error(`Path traversal detected: ${file}`));
        return;
      }
      const rs = task.stream || fs.createReadStream(file);
      this.streamGroup.add(rs);

      rs.on('open', () => {
        this.emit('open', file);
      });

      rs.on('data', (chunk: string | Buffer) => {
        if (finished) return;
        if (this.err) {
          rs.destroy();
          finish();
          return;
        }
        const data = chunk as Buffer;
        if (readSoFar + data.length > task.length) {
          rs.destroy();
          finish(
            new Error(
              `Stream length mismatch for "${file}": expected ${task.length} bytes but received more`,
            ),
          );
          return;
        }
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
        finish(err);
      });

      rs.on('end', () => {
        if (finished) return;
        if (readSoFar !== task.length) {
          finish(
            new Error(
              `Stream length mismatch for "${file}": expected ${task.length} bytes but received ${readSoFar}`,
            ),
          );
          return;
        }
        finish();
      });
    }, this.maxFiles);

    // When all file queues are finished, join all the pieces.
    filesqueue.drain = () => {
      this.hashing = false;
      if (this.err) return;
      this.emit('end');
    };

    // Start queueing jobs.
    this.filetasks.forEach((filetask) => {
      filesqueue.push(filetask);
    });
  }

  /**
   * Sequentially hashes streams of unknown length.
   */
  _startStreams(
    streamItems: Array<{ stream: Readable; path: string[] }>,
  ): void {
    this.hashing = true;
    this.stopped = false;
    this.streamGroup = new StreamSpeed();
    this.totalSize = 0;

    const pieceBuffer = Buffer.alloc(this.pieceLength);
    let bytesWritten = 0;
    let pieceIndex = 0;

    const filesqueue = queue<{ stream: Readable; path: string[] }>(
      (item, callback) => {
        if (this.err || this.stopped) return callback();

        let fileLength = 0;
        let finished = false;
        const file = path.join(this.dir, ...item.path);
        const rs = item.stream;
        this.streamGroup.add(rs);

        const finish = (err?: Error) => {
          if (finished) return;
          finished = true;
          if (err && !this.err) this.emit('error', err);
          callback();
        };

        rs.on('data', (chunk: string | Buffer) => {
          if (finished) return;
          const data = chunk as Buffer;
          fileLength += data.length;
          this.totalSize += data.length;

          let offset = 0;
          while (offset < data.length) {
            const size = Math.min(
              data.length - offset,
              this.pieceLength - bytesWritten,
            );
            data.copy(pieceBuffer, bytesWritten, offset, offset + size);
            bytesWritten += size;
            offset += size;

            if (bytesWritten === this.pieceLength) {
              const buf = Buffer.from(sha1(pieceBuffer));
              this.emit(
                'hash',
                pieceIndex,
                buf,
                file,
                fileLength - data.length + offset - size,
                size,
              );
              pieceIndex++;
              bytesWritten = 0;
            }
          }
        });

        rs.on('error', (err) => {
          finish(err);
        });

        rs.on('end', () => {
          if (finished) return;
          this.files.push({
            length: fileLength,
            path: item.path,
          });
          finish();
        });
      },
      1,
    );

    filesqueue.drain = () => {
      this.hashing = false;
      if (this.err) return;
      if (bytesWritten > 0) {
        const lastSlice = pieceBuffer.subarray(0, bytesWritten);
        const buf = Buffer.from(sha1(lastSlice));
        const lastFile = path.join(
          this.dir,
          ...this.files[this.files.length - 1].path,
        );
        this.emit('hash', pieceIndex, buf, lastFile, 0, bytesWritten);
        this.lastPieceLength = bytesWritten;
        pieceIndex++;
      } else {
        this.lastPieceLength = this.totalSize === 0 ? 0 : this.pieceLength;
      }
      this.pieces = pieceIndex;
      this.emit('end');
    };

    streamItems.forEach((item) => {
      filesqueue.push(item);
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
