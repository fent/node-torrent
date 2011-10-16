crypto = require 'crypto'
b      = require 'bncode'


URL = /^((http|udp|ftp)s?:\/\/)?([a-zA-Z1-90-]{2,}\.)+?([a-zA-Z1-90-]{2,6})(:\d{2,})?(\/\S+)*$/
# returns true if str is a url
isURL = (str) ->
  URL.test str


isInteger = (n) ->
  not isNaN parseInt n


# checks torrent data is correct
checkTorrent = (torrent) ->
  if typeof torrent isnt 'object'
    return 'Torrent is not hash'
  return err if err = checkAnnounce torrent, 'announce'
  return err if err = checkAnnounceList torrent['announce-list']
  return err if err = checkCreationDate torrent['creation date']
  return err if err = checkBuffer torrent, 'comment'
  return err if err = checkBuffer torrent, 'created by'
  return err if err = checkBuffer torrent, 'encoding'

  if not torrent.info?
    return '`info` field not found'

  # multi file mode
  if torrent.info.files?
    if not Array.isArray torrent.info.files
      return '`info.files` is not a list'
    for file in torrent.info.files
      if not file.length?
        return '`length` field not found in file'
      if not isInteger file.length or file.length < 0
        return '`length` is not a positive integer in file'
      return err if err = checkmd5sum file
      if not file.path?
        return '`path` field not found in file'
      if not Array.isArray file.path
        return '`path` is not a list in file'
      for p, i in file.path
        if not Buffer.isBuffer p
          return '`path` is not a list of strings in file'
        file.path[i] = p.toString('utf8')
    if torrent.info.length?
      return 'Cannot have `info.length` in multi file mode'
    if torrent.info.md5sum?
      return 'Cannot have `info.md5sum` in multi file mode'

  # single file mode 
  else
    if not torrent.info.length?
      return '`info.length` not found in single file mode'
    if not isInteger torrent.info.length or torrent.info.length < 0
      return '`info.length` is not a positive integer in file'
    return err if err = checkmd5sum torrent.info

  return err if err = checkBuffer torrent.info, 'name'
  if not torrent.info['piece length']?
    return '`info.piece length` not found'
  if not isInteger(torrent.info['piece length']) or torrent.info['piece length'] < 0
    return '`info.piece length` is not a positive integer'
  if not torrent.info.pieces?
    return '`info.pieces` not found'
  if not Buffer.isBuffer torrent.info.pieces
    return '`info.pieces` is not a buffer'
  if torrent.info.pieces.length % 20 isnt 0
    return '`info.pieces` length is not divisible by 20'

  if torrent.info.private?
    if torrent.info.private isnt 0 and torrent.info.private isnt 1
      return '`info.private` can only be 0 or 1'

  return err if err = checkBuffer torrent.info, 'source'

  return null


checkAnnounce = (torrent) ->
  if not torrent.announce
    return '`announce` field not found'
  return err if err = checkBuffer torrent, 'announce'
  if not isURL torrent.announce
    return '`announce` is not a URL'
  return null


checkAnnounceList = (list) ->
  if list
    if not Array.isArray list
      return '`announce-list` is not a list'
    for item in list
      if not Array.isArray item
        return '`announce-list` is not a list of lists'
      for ann, i in item
        if not Buffer.isBuffer ann
          return 'Field in `announce-list` is not a buffer'
        item[i] = ann.toString('utf8')
        if not isURL item[i]
          return 'Item in `announce-list` list is not a URL'
  return null


checkBuffer = (torrent, field) ->
  if torrent[field]
    if not Buffer.isBuffer torrent[field]
      return "`#{field}` is not a buffer"
    torrent[field] = torrent[field].toString('utf8')
  return null


checkCreationDate = (date) ->
  if date? and not isInteger date
    return '`date` is not an integer'
  return null


checkmd5sum = (parent) ->
  if parent.md5sum?
    if not Buffer.isBuffer parent.md5sum
      return '`md5sum` is not a buffer'
    parent.md5sum = parent.md5sum.toString('utf8')
    if not /[a-f0-9]{32}/i.test(parent.md5sum)
      return '`md5sum` is not a 32 length hex in file'
  return null


validate = (torrent, buf, callback) ->
  err = checkTorrent torrent
  if err isnt null
    err = new Error err
    err.name = 'SchemaError'
    return callback err

  callback null, torrent, buf


# gets info hash of torrent object
getInfoHash = (torrent) ->
  crypto.createHash('sha1').update(b.encode(torrent.info))
    .digest('hex')


module.exports =
  isURL        : isURL
  validate     : validate
  torrent      : checkTorrent
  announce     : checkAnnounce
  announceList : checkAnnounceList
  getInfoHash  : getInfoHash
