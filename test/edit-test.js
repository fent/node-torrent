var   nt = require('..'),
    vows = require('vows'),

  assert = require('assert'),
    path = require('path'),
      fs = require('fs');


var file = __dirname + '/torrents/click.jpg.torrent',
    copy = __dirname + '/result/click.copy.torrent',
options1 = {
  announceList: false
},
options2 = {
  source: 'secret'
};


vows.describe('Edit')
  .addBatch({
    'Edit a torrent': {
      'deleting announce-list': {
        topic: function() {
          nt.edit(file, options1, this.callback);
        },

        'Should not have announce-list': function(err, torrent) {
          if (err) throw err;
          assert.ok(torrent['announce-list'] === undefined);
        },

        'Hash should still match': function(err, torrent) {
          if (err) throw err;
          assert.equal(nt.getInfoHash(torrent),
            '2fff646b166f37f4fd131778123b25a01639e0b3');
        }
      },


      'adding a source and writing': {
        topic: function() {
          var rs = nt.editWrite(file, copy, options2);
          var cb = this.callback;
          rs.on('end', function(torrent) {
            cb(null, torrent);
          });
        },

        'So that hash changes': function(err, torrent) {
          if (err) throw err;
          assert.notEqual(nt.getInfoHash(torrent),
            '6a7eb42ab3b9781eba2d9ff3545d9758f27ec239');
        },
        'and reading the edited file': {
          topic: function(torrent) {
            var cb = this.callback;

            nt.readFile(copy, function(err, result) {
              fs.unlinkSync(copy);
              cb(err, torrent, result);
            });
          },

          'To make sure that it matches': function(err, torrent, result) {
            if (err) throw err;
            assert.equal(nt.getInfoHash(torrent), nt.getInfoHash(result));
            assert.deepEqual(torrent, result);
          }
        }
      }
    }
  })
  .export(module);
