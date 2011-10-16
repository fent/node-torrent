var exec = require('child_process').exec,
    path = require('path'),
      fs = require('fs'),
 uubench = require('uubench');


var file = 'ChipCheezum-Uncharted2Episode15HD547.mp4',
 options = {
    cwd: __dirname,
    maxBuffer: 1 << 20
  };

var suite = new uubench.Suite({
  iterations: 1,
  start: function() {
    console.log('starting...');
  },
  result: function(name, stats) {
    console.log(name + ": " + stats.elapsed/stats.iterations);
  },
  done: function() {
    console.log("finished");
  }
});

var n1 = 1;
suite.bench('nt', function(next) {
  var output = 'nt_' + n1++ + '.torrent';

  if (path.existsSync(output)) {
    fs.unlinkSync(output);
  }

  exec('nt make -a \'http://whatever.com\' -o ' + output + ' ' + file, 
    options, function(err) {
      if (err) throw err;
      next();
    })
});

var n2 = 1;
suite.bench('mktorrent', function(next) {
  var output = 'mktorrent_' + n2++ + '.torrent';

  if (path.existsSync(output)) {
    fs.unlinkSync(output);
  }

  exec('mktorrent -a \'http://whatever.com\' -o ' + output + ' ' + file, 
    options, function(err) {
      if (err) throw err;
      next();
    });
});

suite.run();
