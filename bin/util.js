/**
 * Progress bar constants
 * @const
 */
var BAR   = '♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥♥'
  , NOBAR = '♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡♡'
  , CLEAR = '                                                  '


/**
 * Prints a progress bar at the given percent
 *
 * @param (number) percent
 */
exports.progress = function(percent, speed, color) {
  color = color || 'green';
  var rounded = Math.round(percent / 2);

  // pad percent
  percent = percent.toFixed(2);
  percent = CLEAR.substr(0, 6 - percent.length) + percent;

  // print to stdout
  process.stdout.write(' ['.grey + BAR.substr(0, rounded).bold[color] +
                       NOBAR.substr(0, 50 - rounded) + '] '.grey +
                       percent.bold + '%'.grey + ' ' + speed.bold + '  \r');
};


/**
 * Print any errors to stdout and exit the script
 *
 * @param (string) err
 */
exports.logerr = function(err) {
  process.stderr.write('Error: '.bold.red + (err.message || err) + '\n');
  process.exit(1);
};


/**
 * Separates announce list from command line arguments into
 * main announce URL and additional announce list.
 *
 * @param (Object) options
 * @return (?string) The main announce URL.
 */
exports.getAnnounce = function(options) {
  if (!options.announceList) return null;

  if (options.announceList.length > 1) {
    var announce = options.announceList.shift();
    var announceList = [];
    options.announceList.forEach(function(url, i) {
      announceList[i] = url;
    });
    options.announceList = announceList;

  } else {
    var announce = options.announceList[0];
    delete options.announceList;
  }

  return announce;
};
