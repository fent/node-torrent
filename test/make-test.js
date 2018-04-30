const nt     = require('..');
const vows   = require('vows');
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');


const file1 = path.join(__dirname, 'torrents', 'ubuntu.torrent');
const output1 = path.join(__dirname, 'result', 'new.torrent');
const output2 = path.join(__dirname, 'result', 'ubuntu.copy.torrent');
const tracker = 'http://faketracker.com';
const folder = path.join(__dirname, 'files');
const files = ['click.jpg'];
const options = { pieceLength: 18 /* 256 KB */, private: true };


vows.describe('Make')
  .addBatch({
    'Make a torrent file': {
      topic: function() {
        nt.make(tracker, folder, files, options, this.callback);
      },

      'Info hash matches torrent previously made by mktorrent': (torrent) => {
        assert.equal(torrent.infoHash(),
          '2fff646b166f37f4fd131778123b25a01639e0b3');
      }
    },

    'Make a torrent file with folder, files, and pipe to read': {
      topic: function() {
        var rs = nt.make(tracker, folder, ['.']);

        var cb = this.callback;
        rs.on('error', cb);
        nt.read(rs, cb);
      },

      'Info hash matches': (err, torrent) => {
        if (err) throw err;
        assert.equal(torrent.infoHash(),
          'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Make and write a torrent file with just the folder': {
      topic: function() {
        var rs = nt.makeWrite(output1, tracker, folder);
        var callback = this.callback;

        nt.read(rs, (err, torrent) => {
          fs.unlink(output1, () => {
            callback(err, torrent);
          });
        });
      },

      'Info hash matches': (torrent) => {
        assert.equal(torrent.infoHash(),
          'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Read': {
      topic: function() {
        nt.read(file1, this.callback);
      },

      'Info hash from read file matches': (torrent) => {
        assert.isObject(torrent.metadata);
        assert.equal(torrent.infoHash(),
          'a38d02c287893842a32825aa866e00828a318f07');
      },

      'then write new torrent file': {
        topic: function(torrent) {
          var ws = torrent.createWriteStream(output2);
          var callback = this.callback;
          
          ws.on('close', ()=> {
            nt.read(output2, (err, torrent) => {
              fs.unlink(output2, () => {
                callback(err, torrent);
              });
            });
          });
        },

        'Info hash from read file matches': (torrent) => {
          assert.isObject(torrent.metadata);
          assert.equal(torrent.infoHash(),
            'a38d02c287893842a32825aa866e00828a318f07');
        }
      }

    }
  })
  .export(module);
