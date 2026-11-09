import fs from 'node:fs';
import type { Readable, Stream } from 'node:stream';
import { Stream as BStream } from 'bncode';

import * as schema from './schema';
import Torrent, { type TorrentMetadata } from './torrent';

export type ReadCallback = (err: Error | null, torrent?: Torrent) => void;

/**
 * Read torrent data.
 */
const read = (
  file: string | Readable | Stream,
  validate: boolean | ReadCallback = true,
  callback?: ReadCallback,
): Readable | Stream => {
  if (typeof validate === 'function') {
    callback = validate;
    validate = true;
  }
  if (!callback) {
    callback = () => {};
  }

  const rs = typeof file === 'string' ? fs.createReadStream(file) : file;
  const bstream = new BStream();
  rs.pipe(bstream);

  bstream.on('error', (err: Error) => {
    if ('fd' in rs && typeof rs.fd === 'number') {
      fs.close(rs.fd, () => {});
    }
    callback(err);
  });

  bstream.on('data', (result: unknown) => {
    if (validate) {
      schema.validate(result, callback);
      return;
    }
    callback(null, new Torrent(result as TorrentMetadata));
  });

  return rs;
};

export default read;
