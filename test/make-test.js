var nt     = require('..')
  , vows   = require('vows')
  , assert = require('assert')
  , path   = require('path')
  , fs     = require('fs')
  ;


var file1 = path.join(__dirname, 'torrents', 'ubuntu.torrent')
  , output1 = path.join(__dirname, 'result', 'new.torrent')
  , output2 = path.join(__dirname, 'result', 'ubuntu.copy.torrent')
  , tracker = 'http://faketracker.com'
  , folder = path.join(__dirname, 'files')
  , files = ['click.jpg']
  , options = { pieceLength: 18 /* 256 KB */, private: true }
  ;


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
        nt.readStream(rs, cb);
      },

      'Info hash matches': function(err, torrent) {
        assert.equal(torrent.infoHash(),
                     'c4397e42eb43c9801017a709eb7bce5e3b27aaf9');
      }
    },

    'Make and write a torrent file with just the folder': {
      topic: function() {
        var ws = nt.makeWrite(output1, tracker, folder);

        var cb = this.callback;
        ws.on('error', cb);

        ws.on('close', function() {
          nt.readFile(output1, function(err, torrent) {
            fs.unlink(output1);
            cb(err, torrent);
          });
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
          var callback = this.callback;
          var ws = torrent.createWriteStream(output2);

          ws.on('error', callback);
          ws.on('close', function() {
            nt.read(output2, function(err, torrent) {
              fs.unlink(output2);
              callback(err, torrent);
            });
          });
        },

        'Info hash matches on new file': function(torrent) {
          assert.isObject(torrent.metadata);
          assert.equal(torrent.infoHash(),
            'a38d02c287893842a32825aa866e00828a318f07');
        }
      }
    }
  })
  .export(module);
