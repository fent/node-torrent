import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import * as b from 'bncode';
import Buffers from 'buffers';
import OrderedEmitter from 'ordered-emitter';

import Hasher, {
  type HasherOptions,
  isReadableStream,
  isStreamEntry,
  type StreamEntry,
} from './hasher';
import * as schema from './schema';
import Torrent, { type TorrentInfo, type TorrentMetadata } from './torrent';
import * as util from './util';

// Used to display program info when creating torrents
// and with the cli.
const pkg = JSON.parse(
  fs.readFileSync(`${__dirname}/../package.json`, 'utf8'),
) as { name: string; version: string };
const APP_NAME = pkg.name;
const APP_VERSION = pkg.version;

export interface MakeOptions {
  announceList?: Array<Array<string | Buffer>>;
  comment?: string;
  name?: string;
  pieceLength?: number;
  private?: boolean;
  moreInfo?: Record<string, unknown>;
  maxFiles?: number;
  maxMemory?: number | string;
  multimode?: boolean;
}

export type MakeFiles =
  | string
  | Readable
  | StreamEntry
  | Array<string | Readable | StreamEntry>;

export type MakeCallback = (err: Error | null, torrent?: Torrent) => void;

/**
 * Makes torrent file object
 */
export function make(
  announce: string,
  dir: string,
  files?: MakeFiles | MakeOptions | MakeCallback,
  options?: MakeOptions | MakeCallback,
  callback?: MakeCallback,
): Hasher;
export function make(
  announce: string,
  files: Exclude<MakeFiles, string>,
  options?: MakeOptions | MakeCallback,
  callback?: MakeCallback,
): Hasher;
export function make(
  announce: string,
  dirOrFiles: string | Exclude<MakeFiles, string>,
  ...rest: unknown[]
): Hasher {
  let dir: string;
  let files: MakeFiles | MakeOptions | MakeCallback | undefined;
  let options: MakeOptions | MakeCallback | undefined;
  let callback: MakeCallback | undefined;

  if (typeof dirOrFiles === 'string') {
    dir = dirOrFiles;
    [files, options, callback] = rest as [
      typeof files,
      typeof options,
      typeof callback,
    ];
  } else {
    // No directory given, only streams. Unnamed streams are named after
    // `opts.name`, or `stream` by default.
    files = dirOrFiles;
    [options, callback] = rest as [typeof options, typeof callback];
    const given = typeof options === 'object' ? options?.name : undefined;
    dir = given ?? 'stream';
  }

  // Handle all of the optional arguments.
  const typeofFiles = typeof files;
  const typeofOptions = typeof options;

  let fileList: Array<string | Readable | StreamEntry>;
  let opts: MakeOptions;
  let cb: MakeCallback;

  if (typeofFiles === 'function') {
    cb = files as MakeCallback;
    opts = {};
    fileList = ['.'];
  } else if (
    typeofFiles === 'object' &&
    !Array.isArray(files) &&
    !isReadableStream(files) &&
    !isStreamEntry(files)
  ) {
    cb = typeofOptions === 'function' ? (options as MakeCallback) : () => {};
    opts = files as MakeOptions;
    fileList = ['.'];
  } else {
    if (typeofOptions === 'function') {
      cb = options as MakeCallback;
      opts = {};
    } else {
      cb = callback || (() => {});
      opts = (options as MakeOptions) || {};
    }

    if (
      typeofFiles === 'string' ||
      isReadableStream(files) ||
      isStreamEntry(files)
    ) {
      fileList = [files as string | Readable | StreamEntry];
    } else if (typeofFiles === 'undefined') {
      fileList = ['.'];
    } else {
      fileList = files as Array<string | Readable | StreamEntry>;
    }
  }

  const hashOptions: HasherOptions = {
    maxFiles: opts.maxFiles,
    stopOnErr: true,
  };

  // Default piece length is 256kb.
  const pieceLength = opts.pieceLength ? 1 << opts.pieceLength : 262144;

  // Start hashing files.
  const hasher = new Hasher(dir, fileList, pieceLength, hashOptions);
  const order = new OrderedEmitter();
  const buf = Buffers();
  const info = {} as TorrentInfo;
  let data: Buffer;
  let piecesLength: number;
  let piecesPosition: number;
  let err: Error;

  hasher.readable = true;

  // Check announce URL.
  if (!util.isURL(announce)) {
    err = Error(`Not a URL: ${announce}`);
    process.nextTick(() => {
      hasher.destroy();
      hasher.emit('error', err);
      cb(err);
    });
    return hasher;
  }

  // Check list of files is not empty.
  if (fileList.length === 0) {
    err = Error('no files given');
    process.nextTick(() => {
      hasher.destroy();
      hasher.emit('error', err);
      cb(err);
    });
    return hasher;
  }

  // Make metadata object.
  const metadata = {} as TorrentMetadata;
  metadata.announce = announce;

  // Check and validate announce list.
  if (opts.announceList != null) {
    const msg = schema.announceList(opts.announceList);
    if (msg !== null) {
      err = Error(msg);
      process.nextTick(() => {
        hasher.destroy();
        hasher.emit('error', err);
        cb(err);
      });
      return hasher;
    }
    metadata['announce-list'] = opts.announceList;
  }

  // Check comment options.
  if (opts.comment != null) metadata.comment = opts.comment;

  metadata['created by'] = `${APP_NAME} ${APP_VERSION}`;
  metadata['creation date'] = Math.round(Date.now() / 1000);
  metadata.info = info;

  const populateInfo = () => {
    // Multi file mode.
    if (opts.multimode || hasher.files.length > 1) {
      info.files = hasher.files;
      info.name = opts.name || path.basename(dir);

      // Single file mode.
    } else {
      info.length = hasher.files[0].length;
      info.name = path.join(...hasher.files[0].path);
    }

    info['piece length'] = pieceLength;
    info.pieces = null;
    if (opts.private) info.private = 1;

    // Add additional moreInfo to info.
    for (const moreKey in opts.moreInfo) {
      // Only add moreInfo if it doesn't overwrite info.
      if (!Object.hasOwn(info, moreKey)) {
        info[moreKey] = opts.moreInfo[moreKey];
      }
    }
  };

  // Wait until hasher finishes examining file lengths.
  hasher.on('ready', () => {
    if (hasher.unknownLengths) return;
    populateInfo();

    // Generate fake pieces to encode them.
    piecesLength = 20 * hasher.pieces;
    info.pieces = Buffer.alloc(piecesLength);

    // Bencode data.
    data = Buffer.from(b.encode(metadata), 'binary');
    const strData = data.toString();
    const dict = `6:pieces${piecesLength}:`;
    piecesPosition = strData.indexOf(dict) + dict.length;
    piecesPosition = Buffer.byteLength(strData.slice(0, piecesPosition));

    // Write first part of torrent to stream.
    process.nextTick(() => {
      hasher.emit('data', data.slice(0, piecesPosition));
    });
  });

  // Write last part when hashing is finished.
  hasher.on('end', () => {
    if (hasher.unknownLengths) {
      populateInfo();
      info.pieces = buf.toBuffer();
      data = Buffer.from(b.encode(metadata), 'binary');
      hasher.emit('data', data);
      cb(null, new Torrent(metadata));
      return;
    }

    info.pieces = buf.toBuffer();

    // Note that listeners to this `data` event will be called before
    // listeners to the `end` event since its emitted inside this listener.
    hasher.emit('data', data.slice(piecesPosition + piecesLength));
    cb(null, new Torrent(metadata));
  });

  // listen for hash events
  hasher.on('hash', (index: number, hash: Buffer) => {
    order.emit('hash', { order: index, hash });
  });

  // Emit hash events to memStream in correct order.
  order.on('hash', (obj: { order: number; hash: Buffer }) => {
    buf.push(obj.hash);
    if (!hasher.unknownLengths) {
      hasher.emit('data', obj.hash);
    }
  });

  // Handle stream errors.
  hasher.on('error', (streamErr: Error) => {
    cb(streamErr);
  });

  return hasher;
}

/**
 * Calls make and creates a write stream with the returned read stream.
 */
export const makeWrite = (
  output: string,
  announce: string,
  dir: string,
  files?: MakeFiles | MakeOptions | MakeCallback,
  options?: MakeOptions | MakeCallback,
  callback?: MakeCallback,
): Hasher => {
  const rs = make(announce, dir, files, options, callback);
  rs.pipe(fs.createWriteStream(output));
  return rs;
};
