var schema = require('../lib/schema');
var vows   = require('vows');
var assert = require('assert');


function torrent() {
  return {
    announce: new Buffer('http://tracker.com/1234'),
    info: {
      name: new Buffer('magic'),
      'piece length': 262144,
      pieces: new Buffer(20),
      length: 20

    }
  };
}

var tests = {
  '`announce` and `announce-list` fields not found': function(t) {
    delete t.announce;
  },
  '`announce` is not a buffer': function(t) {
    t.announce = 43;
  },
  '`announce` is not a URL': function(t) {
    t.announce = new Buffer('LOL');
  },
  '`creation date` is not an integer': function(t) {
    t['creation date'] = 'hello';
  },
  '`comment` is not a buffer': function(t) {
    t.comment = 2;
  },
  '`created by` is not a buffer': function(t) {
    t['created by'] = 'me';
  },
  '`encoding` is not a buffer': function(t) {
    t.encoding = [];
  },
  '`info` field not found': function(t) {
    delete t.info;
  },
  '`info.files` is not a list': function(t) {
    t.info = { files: 'no' };
  },
  '`length` field not found in file': function(t) {
    t.info = { files: [{}] };
  },
  '`length` is not a positive integer in file': function(t) {
    t.info = { files: [{ length: 'never' }] };
  },
  '`md5sum` is not a buffer': function(t) {
    t.info = { files: [{ length: 1, md5sum: 'no' }] };
  },
  '`md5sum` is not a 32 length hex in file': function(t) {
    t.info = { files: [{ length: 1, md5sum: new Buffer('ohoh') }] };
  },
  '`path` field not found in file': function(t) {
    t.info = { files: [{ length: 1 }] };
  },
  '`path` is not a list in file': function(t) {
    t.info = { files: [{ length: 1, path: 1 }] };
  },
  '`path` is not a list of buffers in file': function(t) {
    t.info = { files: [{ length: 1, path: [1] }] };
  },
  'Cannot have `info.length` in multi file mode': function(t) {
    t.info = {
      files: [{ length: 1, path: [new Buffer('k')] }],
      length: 1,
    };
  },
  'Cannot have `info.md5sum` in multi file mode': function(t) {
    t.info = {
      files: [{ length: 1, path: [new Buffer('k')] }],
      md5sum: 1,
    };
  },
  '`info.length` not found in single file mode': function(t) {
    delete t.info.length;
  },
  '`info.length` is not a positive integer in file': function(t) {
    t.info.length = 'no';
  },
  '`name` is not a buffer': function(t) {
    t.info.name = 1;
  },
  '`info.piece length` not found': function(t) {
    delete t.info['piece length'];
  },
  '`info.piece length` is not a positive integer': function(t) {
    t.info['piece length'] = 'n';
  },
  '`info.pieces` not found': function(t) {
    delete t.info.pieces;
  },
  '`info.pieces` is not a buffer': function(t) {
    t.info.pieces = 'n';
  },
  '`info.pieces` length is not divisible by 20': function(t) {
    t.info.pieces = new Buffer(19);
  },
  '`info.private` can only be 0 or 1': function(t) {
    t.info.private = 3;
  },
  '`source` is not a buffer': function(t) {
    t.info.source = 4;
  },
};

var batch = {};
for (var test in tests) {
  (function(test, fn) {
    batch[test] = function() {
      var t = torrent();
      fn(t);
      assert.equal(schema.checkTorrent(t), test);
    };
  })(test, tests[test]);
}

vows.describe('Schema')
  .addBatch({
    'Validate invalid torrent': batch
  })
  .export(module);
