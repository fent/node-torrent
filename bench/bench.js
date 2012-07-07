/**
 * Benchmarks nt against mktorrent
 * Run with `node bench.js <file>`
 */

var spawn      = require('child_process').spawn
  , path       = require('path')
  , fs         = require('fs')
  , existsSync = fs.existsSync || path.existsSync
  ;


if (process.argv.length < 3) {
  console.log('Must provide file');
  process.exit(1);
}


var nt_output = 'nt.torrent'
  , mktorrent_output = 'mktorrent.torrent'
  , options = {
    cwd: __dirname
  , maxBuffer: 1 << 30
  }
  , file = process.argv[2]


// check file
if (!existsSync(file)) {
  console.log('Does not exist:', file);
  process.exit(1);
}

// cleanaup possible previous test
cleanup(nt_output);
cleanup(mktorrent_output);

function cleanup(file) {
  if (existsSync(file)) fs.unlinkSync(file);
}


// nt
function nt() {
  console.time('nt');

  var child = spawn('nt', ['make', '-a', 'http://whatever.com',
                          '-o', nt_output, file], options); 

  child.stderr.on('data', function(data) {
    throw new Error(data.toString());
  });

  child.on('exit', function() {
    console.timeEnd('nt');
    mktorrent();
  });
}


// mktorrent
function mktorrent() {
  console.time('mktorrent');
  var child = spawn('mktorrent', ['-a', 'http://whatever.com',
                                  '-o', mktorrent_output, file], options); 
  
  child.stderr.on('data', function(data) {
    throw new Error(data.toString());
  });

  child.on('exit', function() {
    console.timeEnd('mktorrent');
    console.log('Finished');
  });
}


// start
console.log('Starting');
nt();
