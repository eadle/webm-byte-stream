'use strict';

var Writable = require('stream').Writable,
    util = require('util'),
    debug = require('debug')('webm-byte-stream'),
    ebml = require('ebml');



function WebMByteStream(options) {
  var self = this;
  options = options || {};

  Writable.call(self, {});
  self.decoder = new ebml.Decoder();

  // default 10MB video buffer
  var bufferSize = options.bufferSize || 10*1024*1024;
  if (typeof bufferSize !== 'number' || bufferSize < 1) {
    throw new Error('bufferSize must be a positive integer');
  }

  // whether or not to include media segment durations
  var durations = (typeof options.durations === 'boolean')
    ? options.durations: false;

  debug('options: bufferSize=' + bufferSize + ', durations=' + durations);

  self._buffer = new Buffer(bufferSize);
  self._writeHead  = 0;
  self._firstByte  = 0;
  self._totalBytes = 0;

  var initSegmentStart = -1;
  var initSegment = null;
  var cluster = null;
  var timecode = [0, 0];

  self.decoder.on('data', function(chunk) {
    var state = chunk[0];
    var data = chunk[1];

    switch (data.name) {
      case 'EBML':
        if (state === 'start') {
          initSegment = null;
          initSegmentStart = data.start;
          cluster = null;
          timecode = [0, 0];
        }
        break;
      case 'Cluster':
        if (state === 'start' && !initSegment) {
          initSegment = self._read(initSegmentStart, data.start);
          self.emit('Initialization Segment', initSegment);
        } else if (state === 'end') {
          if (data.end - data.start > 0) {
            if (!durations) {
              // emit immediately
              self.emit('Media Segment', {
                cluster: self._read(data.start, data.end),
                timecode: timecode[0],
                duration: -1
              });
            } else {
              // wait until duration is known
              cluster = self._read(data.start, data.end);
            }
          }
        }
        break;
      case 'Timecode':
        // get timestamp of cluster
        var startTime = 0;
        var dataView = new Uint8Array(data.data);
        var bytes = data.dataSize;
        for (var ii = 0; ii < bytes; ii++) {
          startTime |= (dataView[ii] << 8*(bytes-ii-1));
        }
        // store timecode of this cluster
        if (durations) {
          timecode.push(startTime);
          timecode.shift();
        } else {
          timecode[0] = startTime;
        }
        // duration can be determined for previous cluster
        if (durations && null !== cluster) {
          self.emit('Media Segment', {
            cluster: cluster,
            timecode: timecode[0],
            duration: timecode[1] - timecode[0] 
          });
        }
        break;
      default:
    }
  });

}


util.inherits(WebMByteStream, Writable);

/**
 * Write a chunk of data from the input webm.
 *
 * chunk - The data chunk to write.
 * done - The callback function on completed write.
 */
WebMByteStream.prototype._write = function(chunk, enc, done) {
  var self = this;

  debug('_write: ' + chunk.length + ' bytes');

  if (chunk.length > self._buffer.length) {
    throw new Error('write size exceeds bufferSize');
  }

  var max = self._buffer.length - self._writeHead;
  if (chunk.length > max) {
    debug('\tsplit write');
    // first write
    chunk.copy(self._buffer, self._writeHead, 0, max);
    self._totalBytes += max;
    self._firstByte = self._totalBytes;
    // second write
    chunk.copy(self._buffer, 0, max, chunk.length);
    self._totalBytes += (chunk.length - max);
    self._writeHead = (chunk.length - max);
  } else {
    debug('\tsingle write');
    chunk.copy(self._buffer, self._writeHead);
    self._totalBytes += chunk.length;
    self._writeHead += chunk.length;
  }

  self.decoder.write(chunk);

  done();
};

/**
 * Returns bytes in input set [start, end).
 *
 * start - The starting index.
 * end - The index following the final.
 */
WebMByteStream.prototype._read = function(start, end) {
  var self = this;

  var bytes = end - start,
      buffer = new Buffer(bytes),
      readHead = start%(self._buffer.length),
      maxRead = self._buffer.length - readHead;

  debug('_read: start=' + start + ', end=' + end);
  debug('\tbytes=' + bytes + ', readHead=' + readHead + ', maxRead='
    + maxRead);

  if (bytes > self._buffer.length) {
    throw new Error('read size exceeds bufferSize');
  }

  if (bytes > maxRead) {
    debug('\tsplit read');
    self._buffer.copy(buffer, 0, readHead, self._buffer.length);
    self._buffer.copy(buffer, maxRead, 0, bytes - maxRead);
  } else {
    debug('\tsingle read');
    self._buffer.copy(buffer, 0, readHead, readHead + bytes);
  }

  return buffer;
  
};

module.exports = WebMByteStream;
