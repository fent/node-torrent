const crypto       = require('crypto');
const fs           = require('fs');
const b            = require('bncode');
const MemoryStream = require('memorystream');

const Hasher       = require('./hasher');
const buffersMatch = require('./util').buffersMatch;


module.exports = class Torrent {
  /**
   * @constructor
   * @param {Object} metadata
   */
  constructor(metadata) {
    this.metadata = metadata;
  }


  /**
   * @return {string} Returns info hash of torrent
   */
  infoHash() {
    return crypto
      .createHash('sha1')
      .update(b.encode(this.metadata.info))
      .digest('hex');
  }


  /**
   * Creates a readable stream that emits raw torrent data.
   *
   * @return {ReadableStream}
   */
  createReadStream() {
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
   *
   * @param {string} path
   * @param {Object} options
   * @return {WritableStream}
   */
  createWriteStream(path, options) {
    const rs = this.createReadStream();
    const ws = fs.createWriteStream(path, options);
    rs.pipe(ws);
    return ws;
  }


  /**
   * Hash checks torrent.
   *
   * @param {string} dir Directory where files are.
   * @param {Object} options
   * @return {Hasher}
   */
  hashCheck(dir, options) {
    options = options || {};

    const info = this.metadata.info;

    // Check if this is a single or multi file mode torrent.
    let files = info.files || [{ path: [info.name], length: info.length }];

    // Call the hasher.
    let hashOptions = { maxFiles: options.maxFiles };
    let hasher = new Hasher(dir, files, info['piece length'], hashOptions);
    let percentMatched = 0;
    let piecesMatched = 0;
    let pieces = info.pieces.length / 20;

    hasher.on('hash', (index, hash, file, position, length) => {
      // Check that hash matches.
      if (buffersMatch(info.pieces, hash, index * 20)) {
        percentMatched = Math.round(++piecesMatched / pieces * 10000) / 100;
        hasher.emit('match', index, hash, percentMatched, file, position, length);
      } else {
        hasher.emit('matcherror', index, file, position, length);
      }
    });

    return hasher;
  }
};
