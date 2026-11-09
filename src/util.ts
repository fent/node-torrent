import path from 'node:path';

const urlRegexp = /^(http|udp|ftp|dht)s?:\/\//;

/**
 * Returns true if str is a URL.
 */
export const isURL = (str: string | Buffer): boolean =>
  urlRegexp.test(str.toString());

/**
 * Returns true if n is an integer.
 */
export const isInteger = (n: unknown): boolean =>
  !Number.isNaN(Number.parseInt(String(n), 10));

/**
 * Splits a path into an array, platform safe.
 */
export const splitPath = (filepath: string): string[] =>
  filepath.split(path.sep);

/**
 * Returns true if part of buffer `b` beginning at `start` matches buffer `a`.
 */
export const buffersMatch = (a: Buffer, b: Buffer, start: number): boolean => {
  for (let i = 0, l = b.length; i < l; i++) {
    if (a[start + i] !== b[i]) {
      return false;
    }
  }

  return true;
};
