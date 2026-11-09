import path from 'node:path';
import { expect } from 'chai';
import * as util from '../src/util';

describe('Util', () => {
  describe('isURL', () => {
    it('Returns true for valid protocols', () => {
      expect(util.isURL('http://tracker.example.com')).to.be.true;
      expect(util.isURL('https://tracker.example.com')).to.be.true;
      expect(util.isURL('udp://tracker.example.com:1337')).to.be.true;
      expect(util.isURL('ftp://tracker.example.com')).to.be.true;
      expect(util.isURL('dht://tracker.example.com')).to.be.true;
    });

    it('Returns false for non-URLs', () => {
      expect(util.isURL('not a url')).to.be.false;
      expect(util.isURL('ws://tracker.example.com')).to.be.false;
    });
  });

  describe('isInteger', () => {
    it('Returns true for integers', () => {
      expect(util.isInteger(123)).to.be.true;
      expect(util.isInteger('456')).to.be.true;
      expect(util.isInteger(0)).to.be.true;
      expect(util.isInteger(-10)).to.be.true;
    });

    it('Returns false for non-integers and NaN', () => {
      expect(util.isInteger('abc')).to.be.false;
      expect(util.isInteger(Number.NaN)).to.be.false;
      expect(util.isInteger(undefined)).to.be.false;
    });
  });

  describe('splitPath', () => {
    it('Splits path safely', () => {
      const p = path.join('folder', 'subfolder', 'file.txt');
      expect(util.splitPath(p)).to.deep.equal([
        'folder',
        'subfolder',
        'file.txt',
      ]);
    });
  });

  describe('buffersMatch', () => {
    it('Returns true when buffers match', () => {
      const a = Buffer.from('abcdef');
      const b = Buffer.from('cd');
      expect(util.buffersMatch(a, b, 2)).to.be.true;
    });

    it('Returns false when buffers do not match', () => {
      const a = Buffer.from('abcdef');
      const b = Buffer.from('cz');
      expect(util.buffersMatch(a, b, 2)).to.be.false;
    });
  });
});
