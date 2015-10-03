'use strict';

var debug = require('debug')('webm-byte-stream'),
    Writable = require('stream').Writable,
    util = require('util'),
    ebml = require('ebml');

function WebMByteStream(options) {
  var self = this;
  options = options || {};

  Writable.call(self, {});

  // video buffer size (default 10MB)
  self._bufferSize = options.bufferSize || 10*1024*1024;
  if (typeof self._bufferSize !== 'number' || self._bufferSize < 1) {
    throw new Error('bufferSize must be a positive integer');
  }

  // whether or not to include media segment durations (default false)
  self._durations = (typeof options.durations === 'boolean')
    ? options.durations : false;

  // whether or not to clear media segment timecodes (default false)
  self._clearTimecodes = (typeof options.clearTimecodes === 'boolean')
    ? options.clearTimecodes : false;

  debug('options: bufferSize=' + self._bufferSize + ', durations='
    + self._durations + ', clearTimecodes=' + self._clearTimecodes);

  self._buffer = new Buffer(self._bufferSize);
  self._writeHead  = 0;
  self._firstByte  = 0;
  self._totalBytes = 0;

  self._initSegmentStart = -1;
  self._initSegment = null;
  self._cluster = null;
  self._timecode = [
    {value: 0, start: -1, end: -1, dataSize: 0},
    {value: 0, start: -1, end: -1, dataSize: 0}
  ];

  self.decoder = new ebml.Decoder();
  self._setDataCallbacks();

}

util.inherits(WebMByteStream, Writable);

/** Reset the interal buffers. Prepare for new stream. */
WebMByteStream.prototype.reset = function() {
  var self = this;

  // reset decoder
  self.decoder = new ebml.Decoder();
  self._setDataCallbacks();

  // reset internal variables
  self._writeHead  = 0;
  self._firstByte  = 0;
  self._totalBytes = 0;

};

/** Handling EBML data. */
WebMByteStream.prototype._setDataCallbacks = function() {
  var self = this;

  self.decoder.on('data', function(chunk) {
    var state = chunk[0];
    var data = chunk[1];

    switch (data.name) {
      case 'EBML':
        if (state === 'start') {
          self._initSegment = null;
          self._initSegmentStart = data.start;
          self._cluster = null;
          self._timecode = [
            {value: 0, start: -1, end: -1, dataSize: 0},
            {value: 0, start: -1, end: -1, dataSize: 0}
          ];
        }
        break;
      case 'Cluster':
        if (state === 'start' && !self._initSegment) {
          self._initSegment = self._read(self._initSegmentStart,data.start);
          self.emit('Initialization Segment', self._initSegment);
        } else if (state === 'end') {
          if (data.end - data.start > 0) {
            // grab cluster data
            self._cluster = self._read(data.start, data.end);

            // if clearing timecode
            if (self._clearTimecodes) {
              var index = (!self._durations) ? 0 : 1;
              // start of timecode data is known in cluster
              debug('cluster.start=' + data.start + ', timecode[0].start='
                + self._timecode[index].start);
              var start = self._timecode[index].start - data.start + 2,
                  dataSize = self._timecode[index].dataSize;
              // clear the timecode data
              debug('clearing timecode in cluster: start=' + start
                + ', end=' + (start+dataSize));
              for (var ii = 0; ii < dataSize; ii++) {
                self._cluster.writeUInt8(0x0, start + ii);
              }
            }

            // if not waiting for duration
            if (!self._durations) {
              // emit immediately
              self.emit('Media Segment', {
                cluster: self._cluster,
                timecode: self._timecode[0].value,
                duration: -1
              });
            }
          }
        }
        break;
      case 'Timecode':
        // get timestamp of cluster
        var startTime = 0;
        var dataView = new Uint8Array(data.data);
        var dataSize = data.dataSize;
        for (var ii = 0; ii < dataSize; ii++) {
          startTime |= (dataView[ii] << 8*(dataSize-ii-1));
        }
        // store timecode of this cluster
        if (self._durations) {
          self._timecode.push({
            value: startTime,
            start: data.start,
            end: data.end,
            dataSize: dataSize
          });
          self._timecode.shift();
        } else {
          self._timecode[0] = {
            value: startTime,
            start: data.start,
            end: data.end,
            dataSize: dataSize
          };
        }
        // duration can be determined for previous cluster
        if (self._durations && null !== self._cluster) {
          self.emit('Media Segment', {
            cluster: self._cluster,
            timecode: self._timecode[0].value,
            duration: self._timecode[1].value - self._timecode[0].value
          });
        }
        break;
      default:
    }
  });

};

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
