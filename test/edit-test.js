var   nt = require('../lib/torrent'),
    vows = require('vows'),

  assert = require('assert'),
    path = require('path'),
      fs = require('fs');


var file = __dirname + '/torrents/click.jpg.torrent',
   copy1 = __dirname + '/result/click.copy1.torrent',
   copy2 = __dirname + '/result/click.copy2.torrent',
options1 = {
  output: copy1,
  announceList: false
},
options2 = {
  output: copy2,
  source: 'secret'
};


var match = {
  topic: function(output, torrent) {
    var cb = this.callback;

    nt.readFile(output, function(err, result) {
      cb(err, torrent, result);
    });
  },

  'To make sure that it matches': function(err, torrent, result) {
    if (err) throw err;
    assert.equal(nt.getInfoHash(torrent), nt.getInfoHash(result));
    assert.deepEqual(torrent, result);
  }
};


vows.describe('Edit')
  .addBatch({
    'Edit a torrent': {
      'deleting announce-list': {
        topic: function() {
          var cb = this.callback;

          // delete file from previous test
          if (path.existsSync(copy1)) {
            fs.unlinkSync(copy1);
          }

          nt.edit(file, options1, this.callback);
        },

        'Hash should still match': function(err, output, torrent) {
          if (err) throw err;
          assert.equal(nt.getInfoHash(torrent),
            '2fff646b166f37f4fd131778123b25a01639e0b3');
        },
        'and reading the edited file': match
      },


      'adding a source': {
        topic: function() {
          var cb = this.callback;

          // delete file from previous test
          if (path.existsSync(copy2)) {
            fs.unlinkSync(copy2);
          }

          nt.edit(file, options2, this.callback);
        },

        'So that hash changes': function(err, output, torrent) {
          if (err) throw err;
          assert.notEqual(nt.getInfoHash(torrent),
            '6a7eb42ab3b9781eba2d9ff3545d9758f27ec239');
        },
        'and reading the edited file': match
      }
    }
  })
  .export(module);
