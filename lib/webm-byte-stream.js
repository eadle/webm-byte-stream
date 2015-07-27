'use strict';
var Writable = require('stream').Writable,
    debug = require('debug')('webm-byte-stream'),
    ebml = require('ebml');

function WebMByteStream(options) {

  var self = this;
  options = options || {};

  // includes media segment durations if true
  var durations = options.durations || false;
  if (typeof durations !== 'boolean') {
    durations = false;
  }
  // defaults to 10MB cyclic video buffer
  var DEFAULT_BUFFER_SIZE = 10*1024*1024,
      bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
  if (typeof bufferSize !== 'number' || bufferSize < 1) {
    throw new Error('bufferSize must be a positive integer');
  }
  debug('options: bufferSize=' + bufferSize + ', durations=' + durations);

  Writable.call(self, {});
  self.decoder = new ebml.Decoder();

  self._buffer = new Buffer(bufferSize);
  self._writeHead  = 0;
  self._firstByte  = 0;
  self._totalBytes = 0;

  var initSeg = null,
      ebmlStart = -1,
      ebmlEnd = -1,
      hadSeekHead = false,
      cluster = null,
      timecode = [0, 0];

  // Initialization Segment
  self.decoder.on('EBML', function(data) {
    initSeg = null;
    ebmlStart = data.start;
    ebmlEnd = data.end;
    cluster = null;
    timecode[0] = timecode[1] = 0;
  }); 
  self.decoder.on('SeekHead', function(data) {
    hadSeekHead = true;
    initSeg = self._read(ebmlStart, data.start);
  }); 
  self.decoder.on('Info:end', function(data) {
    if (hadSeekHead) {
      initSeg = Buffer.concat([initSeg,
        self._read(data.start, data.end)]);
    } else {
      initSeg = self._read(ebmlStart, data.end);
    }
  }); 
  self.decoder.on('Tracks:end', function(data) {
    initSeg = Buffer.concat([initSeg,
      self._read(data.start, data.end)]);
    self.emit('Initialization Segment', initSeg);
  });

  // Media Segment
  self.decoder.on('Timecode', function(data) {
    // grab the timecode of this cluster
    var startTime = 0,
      bytes = data.dataSize,
      dataView = new Uint8Array(data.data);
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
      // emit the media segment
      self.emit('Media Segment', {
        cluster: cluster,
        timecode: timecode[0],
        duration: timecode[1] - timecode[0] 
      });
    }
  });
  self.decoder.on('Cluster:end', function(data) {
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
  });
}

require('util').inherits(WebMByteStream, Writable);

WebMByteStream.prototype._write = function(chunk, enc, done) {
  var self = this;

  debug('write: ' + chunk.length + ' bytes');

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

/* Returns bytes in input set [start, end). */
WebMByteStream.prototype._read = function(start, end) {
  var self = this;

  var bytes = end - start,
      buffer = new Buffer(bytes),
      readHead = start%(self._buffer.length),
      maxRead = self._buffer.length - readHead;

  debug('_read: start=' + start + ', end=' + end);
  debug('\tbytes=' + bytes + ', readHead=' + readHead + ', maxRead=' + maxRead);

  if (bytes > self._buffer.length) {
    throw new Error('read size exceeds bufferSize');
  }

  if (bytes > maxRead) {
    debug('\nsplit read');
    self._buffer.copy(buffer, 0, readHead, self._buffer.length);
    self._buffer.copy(buffer, maxRead, 0, bytes - maxRead);
  } else {
    debug('\tsingle read');
    self._buffer.copy(buffer, 0, readHead, readHead + bytes);
  }

  return buffer;
  
};

module.exports = WebMByteStream;
