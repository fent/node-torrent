import crypto from 'node:crypto';
import fs from 'node:fs';
import * as b from 'bncode';
import MemoryStream from 'memorystream';

import Hasher, { type FileEntry, type HasherOptions } from './hasher';
import { buffersMatch } from './util';

export interface TorrentInfo {
  name?: string;
  'piece length': number;
  pieces: Buffer | null;
  private?: 0 | 1;
  source?: string;
  length?: number;
  md5sum?: string;
  files?: FileEntry[];
  [key: string]: unknown;
}

export interface TorrentMetadata {
  announce?: string;
  'announce-list'?: Array<Array<string | Buffer>>;
  'creation date'?: number;
  comment?: string;
  'created by'?: string;
  encoding?: string;
  info: TorrentInfo;
  [key: string]: unknown;
}

export default class Torrent {
  public metadata: TorrentMetadata;

  /**
   * @constructor
   */
  constructor(metadata: TorrentMetadata) {
    this.metadata = metadata;
  }

  /**
   * Returns info hash of torrent
   */
  infoHash(): string {
    return crypto
      .createHash('sha1')
      .update(b.encode(this.metadata.info))
      .digest('hex');
  }

  /**
   * Creates a readable stream that emits raw torrent data.
   */
  createReadStream(): MemoryStream {
    const memStream = new MemoryStream();
    memStream.readable = true;

    // Bencode data and emit it from readstream.
    const data = b.encode(this.metadata);

    process.nextTick(() => {
      memStream.write(data, () => {
        memStream.emit('end');
      });
    });

    return memStream;
  }

  /**
   * Shortcut to pipe the readable stream created by Torrent#createReadStream
   * to a writable stream of a file, then return it.
   */
  createWriteStream(
    filepath: string,
    options?: BufferEncoding | Record<string, unknown>,
  ): fs.WriteStream {
    const rs = this.createReadStream();
    const ws = fs.createWriteStream(
      filepath,
      options as Parameters<typeof fs.createWriteStream>[1],
    );
    rs.pipe(ws);
    return ws;
  }

  /**
   * Hash checks torrent.
   */
  hashCheck(dir: string, options?: HasherOptions): Hasher {
    options = options || {};

    const info = this.metadata.info;

    // Check if this is a single or multi file mode torrent.
    const files: FileEntry[] = info.files || [
      { path: [info.name as string], length: info.length as number },
    ];

    // Call the hasher.
    const hashOptions: HasherOptions = { maxFiles: options.maxFiles };
    const hasher = new Hasher(dir, files, info['piece length'], hashOptions);
    let percentMatched = 0;
    let piecesMatched = 0;
    const pieces = (info.pieces as Buffer).length / 20;

    hasher.on(
      'hash',
      (
        index: number,
        hash: Buffer,
        file: string,
        position: number,
        length: number,
      ) => {
        // Check that hash matches.
        if (buffersMatch(info.pieces as Buffer, hash, index * 20)) {
          percentMatched = Math.round((++piecesMatched / pieces) * 10000) / 100;
          hasher.emit(
            'match',
            index,
            hash,
            percentMatched,
            file,
            position,
            length,
          );
        } else {
          hasher.emit('matcherror', index, file, position, length);
        }
      },
    );

    return hasher;
  }
}
