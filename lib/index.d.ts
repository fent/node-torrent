declare module 'node-torrent' {
  import { Stream } from 'stream';

  /**
   * A Hasher object is returned when a torrent is created with `make` and when `Torrent#hashCheck` is called. It inherits from ReadableStream.
   */
  class Hasher extends Stream {
    /**
     * Pause hash checking.
     */
    pause(): boolean;

    /**
     * Resumes hash checking.
     */
    resume(): boolean;

    /**
     * Continues hashing if paused or pauses if not.
     */
    toggle(): boolean;

    /**
     * Stops hashing completely. Closes file descriptors and does not emit any more events.
     */
    destroy(): boolean;
  }

  /**
   * The `read` and `make` functions all call their callback with a Torrent object.
   */
  class Torrent {
    /**
     * Contains metadata of the torrent. Example:
     *
     * ```js
     * {
     *   announce: 'udp://tracker.publicbt.com:80',
     *   'announce-list': [
     *     [ 'udp://tracker.publicbt.com:80' ],
     *     [ 'udp://tracker.ccc.de:80' ],
     *     [ 'udp://tracker.openbittorrent.com:80' ],
     *     [ 'http://tracker.thepiratebay.org/announce' ]
     *   ],
     *   comment: 'Torrent downloaded from http://thepiratebay.org',
     *   'creation date': 1303979726,
     *   info: { length: 718583808,
     *     name: 'ubuntu-11.04-desktop-i386.iso',
     *     'piece length': 524288,
     *     pieces: <Buffer e5 7a ...>
     *   }
     * }
     * ```
     */
    metadata: object;

    /**
     * Get a torrent's info hash.
     */
    infoHash(): string;

    /**
     * Creates a ReadableStream that emits raw bencoded data for this torrent. Returns the readable stream.
     */
    createReadStream(): ReadableStream;

    /**
     * Shortcut that pipes the stream from `Torrent#createReadStream()` to a writable file stream. Returns the writable stream.
     */
    createWriteStream(
      path: string,
      options?: string | Partial<{
        flags: string;
        encoding: BufferEncoding;
        fd: number;
        mode: number;
        autoClose: boolean;
        emitClose: boolean;
        start: number;
        highWaterMark: number;
      }>
    ): WritableStream;

    /**
     * Hash checks torrent against files in `dir`.
     * 
     * @param options Hash can have `maxFiles` to open during hashing. Defaults to `250`.
     */
    hashCheck(
      dir: string,
      options?: Partial<{
        maxFiles: number;
      }>
    ): Hasher;
  }

  type MakeOptions = {
    /**
     * An array of arrays of additional announce URLs.
     */
    announceList: string[][];

    comment: string;

    /**
     * Can be used only in multi file mode. If not given, defaults to name of directory.
     */
    name: string;

    /**
     * How to break up the pieces. Must be an integer `n` that says piece length will be `2^n`. Default is 256KB, or 2^18.
     */
    pieceLength: number;

    /**
     * Set true if this is a private torrent.
     */
    private: boolean;

    /**
     * These go into the `info` dictionary of the torrent. Useful if you want to make a torrent have a unique info hash from a certain tracker.
     */
    moreInfo: object;

    /**
     * Max files to open during piece hashing. Defaults to 250.
     */
    maxFiles: number;
  }

  namespace NodeTorrent {
    /**
     * Reads a local file, or a readable stream. Returns readable stream.
     * 
     * An error can be returned if the torrent is formatted incorrectly.
     * Does not check if the dictonaries are listed alphabetically.
     * Refer to the [BitTorrent Specification](https://wiki.theory.org/BitTorrentSpecification) for more info on torrent metainfo.
     *
     * @param file Where the torrent resides, can be local file, remote, or a readable stream.
     * @param validate Validate or not schema.
     * @param callback Called with a possible `Error`, and a `Torrent` object when hashing is finished.
     */
    export function read(
      file: string | ReadableStream,
      validate?: boolean,
      callback?: (err: Error, torrent: Torrent) => void
    ): ReadableStream;

    /**
     * Makes a new torrent. `dir` is root directory of the torrent. The `files` array will relatively read files from there.
     * If files is omitted, it implicitly adds all of the files in `dir` to the torrent, including those in subdirectories.
     *
     * @param announce The announce URL.
     * @param dir Directory where the files in the files array are.
     * @param files Optional.
     * @param options Any options for the torrent go here.
     * @return A Hasher object that emits raw bencoded `data` events.
     */
    export function make(
      announce: string,
      dir: string,
      files?: string[],
      options?: Partial<MakeOptions>,
      callback?: (err: Error, torrent: Torrent) => void
    ): Hasher;

    /**
     * A shortcut that pumps the returned readable stream from `make` into a writable stream that points to the file `output`.
     * @return A Hasher object.
     */
    export function makeWrite(
      output: string,
      announce: string,
      dir: string,
      files?: string[],
      options?: Partial<MakeOptions>,
      callback?: (err: Error, torrent: Torrent) => void
    ): Hasher;
  }

  export = NodeTorrent;
}
