var nt     = require('..');
var vows   = require('vows');
var assert = require('assert');
var path   = require('path');
var fs     = require('fs');


var file1 = path.join(__dirname, 'torrents', 'ubuntu.torrent');
var output1 = path.join(__dirname, 'result', 'new.torrent');
var output2 = path.join(__dirname, 'result', 'ubuntu.copy.torrent');
var tracker = 'http://faketracker.com';
var folder = path.join(__dirname, 'files');
var files = ['click.jpg'];
var options = { pieceLength: 18 /* 256 KB */, private: true };


vows.describe('Make')
  .addBatch({
    'Make a torrent file': {
      topic: function() {
        nt.make(tracker, folder, files, options, this.callback);
      },

      'Info hash matches torrent previously made by mktorrent':
        function(torrent) {
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

      'Info hash matches': function(err, torrent) {
        if (err) throw err;
        assert.equal(torrent.infoHash(),
                     'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Make and write a torrent file with just the folder': {
      topic: function() {
        var rs = nt.makeWrite(output1, tracker, folder);
        var callback = this.callback;

        nt.read(rs, function(err, torrent) {
          fs.unlink(output1);
          callback(err, torrent);
        });
      },

      'Info hash matches': function(torrent) {
        assert.equal(torrent.infoHash(),
                     'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Read': {
      topic: function() {
        nt.read(file1, this.callback);
      },

      'Info hash from read file matches': function(torrent) {
        assert.isObject(torrent.metadata);
        assert.equal(torrent.infoHash(),
          'a38d02c287893842a32825aa866e00828a318f07');
      },

      'then write new torrent file': {
        topic: function(torrent) {
          var ws = torrent.createWriteStream(output2);
          var callback = this.callback;
          
          ws.on('close', function(){
            nt.read(output2, function(err, torrent) {
              fs.unlink(output2);
              callback(err, torrent);
            });
          });
        },

        'Info hash from read file matches': function(torrent) {
          assert.isObject(torrent.metadata);
          assert.equal(torrent.infoHash(),
            'a38d02c287893842a32825aa866e00828a318f07');
        }
      }

    }
  })
  .export(module);
