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

/**
 * An input resolved to a torrent path. Exactly one source field is set:
 * `stream` for readable inputs or `filepath` for files on disk. `length` stays
 * undefined for streams whose size cannot be inferred.
 */
type ResolvedItem = {
  path: string[];
  length?: number;
  autoNamed?: boolean;
} & ({ stream: Readable } | { filepath: string });

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

const isStreamInput = (item: unknown): item is Readable | StreamEntry =>
  isReadableStream(item) || isStreamEntry(item);

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

/**
 * Builds a torrent's file list and hashes it into pieces.
 *
 * Inputs are first resolved and validated, then piece offsets are planned. When
 * every input length is known, files are read in parallel. If any stream length
 * is unknown, hashing switches to a single sequential pass because each input's
 * starting offset depends on everything before it.
 */
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
   * Resolves the inputs and prepares the hasher.
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

    if (list.some(isStreamInput)) {
      this._resolveInputs(list).then(
        (items) => this._beginHashing(items),
        (err: Error) => this._emitError(err),
      );
      return;
    }

    this._beginPathInputs(list);
  }

  // ---------------------------------------------------------------------------
  // Input resolution
  // ---------------------------------------------------------------------------

  /**
   * Reports an error on the next tick so callers can attach listeners.
   */
  private _emitError(err: Error): void {
    process.nextTick(() => this.emit('error', err));
  }

  /**
   * Resolves streams and paths into a single ordered list of torrent entries.
   *
   * Unlike pure path lists (which are sorted globally), the order of the input
   * list is authoritative here. Directories are expanded in place and their
   * entries are sorted within that directory.
   */
  private async _resolveInputs(list: HasherInput[]): Promise<ResolvedItem[]> {
    const baseName = path.basename(this.dir) || 'stream';
    const items: ResolvedItem[] = [];

    for (const input of list) {
      if (isReadableStream(input)) {
        items.push(this._streamItem(input, baseName));
      } else if (isStreamEntry(input)) {
        items.push(this._streamEntryItem(input, baseName));
      } else if (typeof input === 'string') {
        await this._collectPath(input, items);
      } else {
        throw new Error('Mixed lists can only contain file paths and streams');
      }
    }

    await Promise.all(
      items.map(async (item) => {
        if ('stream' in item && item.length === undefined) {
          item.length = await inferStreamLength(item.stream);
        }
      }),
    );

    this._validateItems(items);
    this._assignNames(items);
    return items;
  }

  /**
   * Builds a torrent entry for a bare readable stream.
   */
  private _streamItem(stream: Readable, baseName: string): ResolvedItem {
    return {
      stream,
      path: inferStreamPath(stream) ?? [baseName],
      autoNamed: true,
    };
  }

  /**
   * Builds a torrent entry for a `{ stream, path, length }` input.
   */
  private _streamEntryItem(entry: StreamEntry, baseName: string): ResolvedItem {
    const rawPath = entry.path;
    let itemPath: string[];
    if (rawPath == null) {
      itemPath = inferStreamPath(entry.stream) ?? [baseName];
    } else if (Array.isArray(rawPath)) {
      itemPath = rawPath;
    } else {
      itemPath = util.splitPath(rawPath);
    }

    return {
      stream: entry.stream,
      path: itemPath,
      length: entry.length,
      autoNamed: rawPath == null,
    };
  }

  /**
   * Validates an input path, then expands it into files in list order.
   */
  private async _collectPath(
    input: string,
    items: ResolvedItem[],
  ): Promise<void> {
    const relPath = path.normalize(input);
    if (path.isAbsolute(relPath) || relPath.split(path.sep).includes('..')) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    await this._walkPath(relPath, items);
  }

  /**
   * Recursively walks a path. Directories are expanded in sorted order.
   */
  private async _walkPath(
    relPath: string,
    items: ResolvedItem[],
  ): Promise<void> {
    const fullPath = path.join(this.dir, relPath);
    const stat = await fs.promises.stat(fullPath);

    if (stat.isFile()) {
      items.push({
        path: util.splitPath(relPath),
        length: stat.size,
        filepath: fullPath,
      });
      return;
    }

    if (stat.isDirectory()) {
      const names = (await fs.promises.readdir(fullPath)).sort();
      for (const name of names) {
        await this._walkPath(path.join(relPath, name), items);
      }
    }
  }

  /**
   * Rejects invalid paths and stream lengths.
   */
  private _validateItems(items: ResolvedItem[]): void {
    for (const item of items) {
      const label = item.path.join('/');
      if (
        item.path.length === 0 ||
        !item.path.every(
          (seg) =>
            typeof seg === 'string' && isValidPathSegment(Buffer.from(seg)),
        )
      ) {
        throw new Error(`Path traversal detected: ${label}`);
      }

      if (
        'stream' in item &&
        item.length !== undefined &&
        (!Number.isInteger(item.length) || item.length < 0)
      ) {
        throw new Error(
          `Invalid stream length for "${label}": must be a non-negative integer`,
        );
      }
    }
  }

  /**
   * Reserves explicit paths and gives unnamed streams unique suffixes.
   */
  private _assignNames(items: ResolvedItem[]): void {
    const usedPaths = new Set<string>();

    // Explicit paths, including files found on disk, must be unique.
    for (const item of items) {
      if (item.autoNamed) continue;
      const key = item.path.join('/');
      if (usedPaths.has(key)) {
        throw new Error(`Duplicate path: ${key}`);
      }
      usedPaths.add(key);
    }

    // Unnamed streams avoid both disk paths and other stream paths.
    for (const item of items) {
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

    // A file path cannot also be a directory prefix of another path.
    for (const item of items) {
      for (let i = 1; i < item.path.length; i++) {
        const prefix = item.path.slice(0, i).join('/');
        if (usedPaths.has(prefix)) {
          throw new Error(`Path conflict: ${prefix}`);
        }
      }
    }
  }

  /**
   * Starts reading pure path inputs. Paths are sorted so the resulting torrent
   * does not depend on filesystem iteration order.
   */
  private _beginPathInputs(list: HasherInput[]): void {
    fs.access(this.dir, (err) => {
      if (err) {
        this.emit('error', err);
        return;
      }

      if (typeof list[0] === 'string') {
        this._loadPaths(list as string[]);
      } else {
        this._useFileEntries(list as FileEntry[]);
      }
    });
  }

  /**
   * Stats and expands paths, then plans the piece layout.
   */
  private _loadPaths(paths: string[]): void {
    // Limit how many files are opened while walking the tree.
    const statqueue = queue<string, fs.Stats>((filepath, cb) => {
      fs.stat(filepath, cb);
    }, this.maxFiles);

    this._getFilesStats(statqueue, paths, (err?: Error | null) => {
      // Sort even on failure so partially collected files are deterministic.
      this.files = Array.from(this.files).sort(sortByPath);

      if (err) {
        this.emit('error', err);
        return;
      }

      this._CreateFileTasks();
      this._readyAndStart(() => this._start());
    });
  }

  /**
   * Uses an already-known file list, such as one from an existing torrent.
   * Order is preserved because it determines the piece hashes.
   */
  private _useFileEntries(entries: FileEntry[]): void {
    this.files = Array.from(entries);
    process.nextTick(() => {
      this._CreateFileTasks();
      this._readyAndStart(() => this._start());
    });
  }

  /**
   * Starts hashing a resolved stream/path list.
   *
   * When every length is known, piece offsets can be planned up front and files
   * are hashed in parallel. If any stream length is unknown, hashing falls back
   * to a single sequential pass because later offsets cannot be known yet.
   */
  private _beginHashing(items: ResolvedItem[]): void {
    if (items.some((item) => item.length === undefined)) {
      this.unknownLengths = true;
      this.files = [];
      this._readyAndStart(() => this._startSequential(items));
      return;
    }

    this.files = items.map((item) => ({
      length: item.length as number,
      path: item.path,
    }));
    this._CreateFileTasks();

    // Attach stream-backed tasks; path-backed tasks are opened when hashed.
    items.forEach((item, i) => {
      if ('stream' in item) this.filetasks[i].stream = item.stream;
    });

    this._readyAndStart(() => this._start());
  }

  /**
   * Marks the hasher ready, then starts hashing on the next tick.
   */
  private _readyAndStart(start: () => void): void {
    process.nextTick(() => {
      this.ready = true;
      this.emit('ready');
      start();
    });
  }

  // ---------------------------------------------------------------------------
  // Piece planning
  // ---------------------------------------------------------------------------

  /**
   * Plans which pieces each file covers.
   *
   * Files are laid out consecutively, so a file may start partway into a piece
   * and may span several pieces. Each task records its first piece and the
   * offset within that piece.
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

  // ---------------------------------------------------------------------------
  // Hashing
  // ---------------------------------------------------------------------------

  /**
   * Hashes a fully planned file list in parallel.
   *
   * Only used when every input length is known, since piece offsets must be
   * calculated before reading starts.
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
        // A chunk can begin partway through a piece and may span several.
        // Recalculate the current piece from the task's starting offset.
        pieceIndex =
          task.piece + Math.floor((task.offset + readSoFar) / this.pieceLength);

        // Write the chunk into its piece buffer(s).
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
   * Hashes inputs one at a time in list order.
   *
   * Used whenever any stream length is unknown: later piece offsets cannot be
   * planned until earlier inputs have been read, so parallelism is not possible.
   * File entries are recorded as each input finishes, which lets `make` build
   * metadata once the whole list has been consumed.
   */
  _startSequential(items: ResolvedItem[]): void {
    this.hashing = true;
    this.stopped = false;
    this.streamGroup = new StreamSpeed();
    this.totalSize = 0;

    const pieceBuffer = Buffer.alloc(this.pieceLength);
    let bytesWritten = 0;
    let pieceIndex = 0;

    const filesqueue = queue<ResolvedItem>((item, callback) => {
      if (this.err || this.stopped) return callback();

      let fileLength = 0;
      let finished = false;
      const file = path.join(this.dir, ...item.path);
      const rs =
        'stream' in item ? item.stream : fs.createReadStream(item.filepath);
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

        // Fill the current piece buffer. Whenever it fills, hash it and
        // continue with the rest of the chunk in the next piece.
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

      rs.on('error', (err: Error) => {
        finish(err);
      });

      rs.on('end', () => {
        if (finished) return;
        if (item.length !== undefined && fileLength !== item.length) {
          finish(
            new Error(
              `Stream length mismatch for "${file}": expected ${item.length} bytes but received ${fileLength}`,
            ),
          );
          return;
        }
        this.files.push({
          length: fileLength,
          path: item.path,
        });
        finish();
      });
    }, 1);

    filesqueue.drain = () => {
      this.hashing = false;
      if (this.err) return;

      // Hash the final partial piece, if there is one. When the total size
      // divides evenly, the last full piece was already emitted above.
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

    items.forEach((item) => {
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
