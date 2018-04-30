'use strict';

const schema = require('../lib/schema');
const vows   = require('vows');
const assert = require('assert');


function torrent() {
  return {
    announce: Buffer.from('http://tracker.com/1234'),
    info: {
      name: Buffer.from('magic'),
      'piece length': 262144,
      pieces: Buffer.alloc(20),
      length: 20

    }
  };
}

var tests = {
  '`announce` and `announce-list` fields not found': (t) => {
    delete t.announce;
  },
  '`announce` is not a buffer': (t) => {
    t.announce = 43;
  },
  '`announce` is not a URL': (t) => {
    t.announce = Buffer.from('LOL');
  },
  '`creation date` is not an integer': (t) => {
    t['creation date'] = 'hello';
  },
  '`comment` is not a buffer': (t) => {
    t.comment = 2;
  },
  '`created by` is not a buffer': (t) => {
    t['created by'] = 'me';
  },
  '`encoding` is not a buffer': (t) => {
    t.encoding = [];
  },
  '`info` field not found': (t) => {
    delete t.info;
  },
  '`info.files` is not a list': (t) => {
    t.info = { files: 'no' };
  },
  '`length` field not found in file': (t) => {
    t.info = { files: [{}] };
  },
  '`length` is not a positive integer in file': (t) => {
    t.info = { files: [{ length: 'never' }] };
  },
  '`md5sum` is not a buffer': (t) => {
    t.info = { files: [{ length: 1, md5sum: 'no' }] };
  },
  '`md5sum` is not a 32 length hex in file': (t) => {
    t.info = { files: [{ length: 1, md5sum: Buffer.from('ohoh') }] };
  },
  '`path` field not found in file': (t) => {
    t.info = { files: [{ length: 1 }] };
  },
  '`path` is not a list in file': (t) => {
    t.info = { files: [{ length: 1, path: 1 }] };
  },
  '`path` is not a list of buffers in file': (t) => {
    t.info = { files: [{ length: 1, path: [1] }] };
  },
  'Cannot have `info.length` in multi file mode': (t) => {
    t.info = {
      files: [{ length: 1, path: [Buffer.from('k')] }],
      length: 1,
    };
  },
  'Cannot have `info.md5sum` in multi file mode': (t) => {
    t.info = {
      files: [{ length: 1, path: [Buffer.from('k')] }],
      md5sum: 1,
    };
  },
  '`info.length` not found in single file mode': (t) => {
    delete t.info.length;
  },
  '`info.length` is not a positive integer in file': (t) => {
    t.info.length = 'no';
  },
  '`name` is not a buffer': (t) => {
    t.info.name = 1;
  },
  '`info.piece length` not found': (t) => {
    delete t.info['piece length'];
  },
  '`info.piece length` is not a positive integer': (t) => {
    t.info['piece length'] = 'n';
  },
  '`info.pieces` not found': (t) => {
    delete t.info.pieces;
  },
  '`info.pieces` is not a buffer': (t) => {
    t.info.pieces = 'n';
  },
  '`info.pieces` length is not divisible by 20': (t) => {
    t.info.pieces = Buffer.alloc(19);
  },
  '`info.private` can only be 0 or 1': (t) => {
    t.info.private = 3;
  },
  '`source` is not a buffer': (t) => {
    t.info.source = 4;
  },
};

var batch = {};
for (let test in tests) {
  batch[test] = () => {
    var t = torrent();
    tests[test](t);
    assert.equal(schema.checkTorrent(t), test);
  };
}

vows.describe('Schema')
  .addBatch({
    'Validate invalid torrent': batch
  })
  .export(module);
