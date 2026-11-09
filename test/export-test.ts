import { expect } from 'chai';
import { Hasher, make, makeWrite, read, Torrent } from '../src';

describe('Exports', () => {
  it('Exports expected named functions and classes', () => {
    expect(read).to.be.a('function');
    expect(make).to.be.a('function');
    expect(makeWrite).to.be.a('function');
    expect(Hasher).to.be.a('function');
    expect(Torrent).to.be.a('function');
  });
});
