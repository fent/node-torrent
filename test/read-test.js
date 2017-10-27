const nt     = require('..');
const vows   = require('vows');
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');


const file2 = path.join(__dirname,'torrents', 'click.jpg.torrent');
const file4 = path.join(__dirname, 'torrents', 'chipcheezum.torrent');


vows.describe('Read')
  .addBatch({
    // This torrent was created with mktorrent.
    'Read a local file': {
      'made by mktorrent': {
        topic: function() {
          nt.read(file2, this.callback);
        },

        'Info hash matches': (result) => {
          assert.isObject(result.metadata);
          assert.equal(result.infoHash(),
            '2fff646b166f37f4fd131778123b25a01639e0b3');
        },
        'Announce URL is correct': (result) => {
          assert.isObject(result.metadata);
          assert.include(result.metadata, 'announce');
          assert.equal(result.metadata.announce, 'http://hello.2u');
        },
        'Single file mode': (result) => {
          assert.isObject(result.metadata);
          assert.include(result.metadata, 'info');
          assert.include(result.metadata.info, 'name');
          assert.equal(result.metadata.info.name, 'click.jpg');
          assert.isUndefined(result.metadata.info.files);
          assert.include(result.metadata.info, 'length');
          assert.equal(result.metadata.info.length, 87582);
        },
        '256 KB piece length': (result) => {
          assert.isObject(result.metadata);
          assert.include(result.metadata, 'info');
          assert.include(result.metadata.info, 'piece length');
          assert.equal(result.metadata.info['piece length'], 262144);
        },
        'Private torrent': (result) => {
          assert.isObject(result.metadata);
          assert.include(result.metadata, 'info');
          assert.include(result.metadata.info, 'private');
          assert.equal(result.metadata.info.private, 1);
        }
      },

      'that holds a big video file': {
        topic: function() {
          nt.read(file4, this.callback);
        },

        'Info hash matches': (result) => {
          assert.isObject(result.metadata);
          assert.equal(result.infoHash(),
            'a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
        }
      }
    },

    'Read a stream': {
      'that holds a big video file': {
        topic: function() {
          nt.read(fs.createReadStream(file4), this.callback);
        },

        'Info hash matches': (result) => {
          assert.isObject(result.metadata);
          assert.equal(result.infoHash(),
            'a51cbb0e3b4d6430ca0d1da70c1c7b0bb94304f4');
        }
      }
    },
  })
  .export(module);
