import Torrent, { type TorrentMetadata } from './torrent';
import * as util from './util';

export type RawDict = Record<string, unknown>;

/**
 * Check if field that should be a buffer and exists is a buffer.
 */
const checkBuffer = (torrent: RawDict, field: string): string | null => {
  return torrent[field] && !Buffer.isBuffer(torrent[field])
    ? `\`${field}\` is not a buffer`
    : null;
};

/**
 * Checks that a path segment is safe and does not traverse directories.
 */
export const isValidPathSegment = (buf: unknown): boolean => {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return false;
  const str = buf.toString('utf8');
  if (str === '.' || str === '..') return false;
  if (str.includes('/') || str.includes('\\') || str.includes('\0'))
    return false;
  if (/^[a-zA-Z]:/.test(str)) return false;
  return true;
};

/**
 * Checks announce fields are correct.
 */
const checkAnnounce = (torrent: RawDict): string | null => {
  let err: string | null;
  if (torrent.announce) {
    err = checkBuffer(torrent, 'announce');
    if (err) return err;
    if (!util.isURL(torrent.announce as Buffer))
      return '`announce` is not a URL';
  }
  return null;
};

/**
 * Checks announce list field.
 */
export const announceList = (list: unknown): string | null => {
  if (list) {
    if (!Array.isArray(list)) return '`announce-list` is not a list';

    for (const item of list) {
      if (!Array.isArray(item)) {
        return '`announce-list` is not a list of lists';
      }
      for (const ann of item) {
        if (!Buffer.isBuffer(ann)) {
          return 'Item in `announce-list` is not a buffer';
        }
        if (!util.isURL(ann)) {
          return 'Item in `announce-list` list is not a URL';
        }
      }
    }
  }
  return null;
};

/**
 * Check if the creation date exists and is an integer.
 */
const checkCreationDate = (date: unknown): string | null => {
  return date != null && !util.isInteger(date)
    ? '`creation date` is not an integer'
    : null;
};

/**
 * Check md5 sum of torrent is correct.
 */
const md5sumRegexp = /^[a-f0-9]{32}$/i;
const checkmd5sum = (parent: RawDict): string | null => {
  if (parent.md5sum != null) {
    if (!Buffer.isBuffer(parent.md5sum)) return '`md5sum` is not a buffer';
    if (!md5sumRegexp.test(parent.md5sum.toString())) {
      return '`md5sum` is not a 32 length hex in file';
    }
  }
  return null;
};

/**
 * Converts all buffers in the torrent object to utf8 strings.
 * Except for the key `info.pieces` which will remain a buffer.
 */
const buf2str = (torrent: RawDict, currentPath: string): void => {
  Object.keys(torrent).forEach((key) => {
    const val = torrent[key];

    if (Buffer.isBuffer(val)) {
      if (currentPath !== '.info' || key !== 'pieces') {
        torrent[key] = val.toString('utf8');
      }
    } else if (typeof val === 'object') {
      buf2str(val as RawDict, `${currentPath}.${key}`);
    }
  });
};

/**
 * Checks torrent metadata is correct.
 */
export const checkTorrent = (torrentInput: unknown): string | null => {
  let err: string | null;

  if (typeof torrentInput !== 'object' || torrentInput === null) {
    return 'Torrent is not a hash';
  }
  const torrent = torrentInput as RawDict;

  err = checkAnnounce(torrent);
  if (err) return err;
  err = announceList(torrent['announce-list']);
  if (err) return err;
  err = checkCreationDate(torrent['creation date']);
  if (err) return err;
  err = checkBuffer(torrent, 'comment');
  if (err) return err;
  err = checkBuffer(torrent, 'created by');
  if (err) return err;
  err = checkBuffer(torrent, 'encoding');
  if (err) return err;

  if (torrent.info == null) return '`info` field not found';
  const info = torrent.info as RawDict;

  // Multi file mode.
  if (info.files != null) {
    if (!Array.isArray(info.files)) return '`info.files` is not a list';
    for (const fileItem of info.files) {
      const file = fileItem as RawDict;
      if (file.length == null) {
        return '`length` field not found in file';
      }
      if (!util.isInteger(file.length) || (file.length as number) < 0) {
        return '`length` is not a positive integer in file';
      }
      err = checkmd5sum(file);
      if (err) return err;
      if (!file.path) return '`path` field not found in file';
      if (!Array.isArray(file.path)) return '`path` is not a list in file';
      if (file.path.length === 0) return '`path` is empty in file';

      if (!file.path.every(Buffer.isBuffer)) {
        return '`path` is not a list of buffers in file';
      }
      if (!file.path.every(isValidPathSegment)) {
        return '`path` contains invalid path segments in file';
      }
    }
    if (info.length != null) {
      return 'Cannot have `info.length` in multi file mode';
    }
    if (info.md5sum != null) {
      return 'Cannot have `info.md5sum` in multi file mode';
    }

    // Single file mode.
  } else {
    if (info.length == null) {
      return '`info.length` not found in single file mode';
    }
    if (!util.isInteger(info.length) || (info.length as number) < 0) {
      return '`info.length` is not a positive integer in file';
    }
    err = checkmd5sum(info);
    if (err) return err;
  }

  if (info.name == null) return '`info.name` not found';
  err = checkBuffer(info, 'name');
  if (err) return err;
  if (!isValidPathSegment(info.name as Buffer)) {
    return '`name` contains invalid characters';
  }
  if (info['piece length'] == null) {
    return '`info.piece length` not found';
  }
  const pieceLength = info['piece length'];
  if (!util.isInteger(pieceLength) || (pieceLength as number) <= 0) {
    return '`info.piece length` is not a positive integer';
  }
  const pieceLengthNum = pieceLength as number;
  if (pieceLengthNum < 16384 || (pieceLengthNum & (pieceLengthNum - 1)) !== 0) {
    return '`info.piece length` must be a power of 2 and at least 16384';
  }
  if (info.pieces == null) return '`info.pieces` not found';
  if (!Buffer.isBuffer(info.pieces)) {
    return '`info.pieces` is not a buffer';
  }
  if (info.pieces.length % 20 !== 0) {
    return '`info.pieces` length is not divisible by 20';
  }
  if (info.private != null && info.private !== 0 && info.private !== 1) {
    return '`info.private` can only be 0 or 1';
  }
  err = checkBuffer(info, 'source');
  if (err) return err;
  return null;
};

/**
 * Checks a torrent object, makes sure its metadata matches the schema.
 */
export const validate = (
  torrent: unknown,
  callback: (err: Error | null, torrent?: Torrent) => void,
): void => {
  const errmsg = checkTorrent(torrent);
  if (errmsg !== null) {
    const err = Error(errmsg);
    err.name = 'SchemaError';
    callback(err);
    return;
  }

  // Convert all buffers into strings that are not hash pieces.
  buf2str(torrent as RawDict, '');

  // Put metadata into torrent object and call callback with the result.
  callback(null, new Torrent(torrent as TorrentMetadata));
};
