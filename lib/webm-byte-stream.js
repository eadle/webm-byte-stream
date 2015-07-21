'use strict';
var Writable = require('stream').Writable,
  ebml = require('ebml');

function WebMByteStream(options) {
  options = options || {};

  var durations = options.durations || false;
  if (typeof durations !== "boolean") {
    durations = false;
  }

  var DEFAULT_BUFFER_SIZE = 10*1024*1024;
  var bufferSize = options.bufferSize || DEFAULT_BUFFER_SIZE;
  if (typeof bufferSize !== "number" || bufferSize < DEFAULT_BUFFER_SIZE) {
    bufferSize = DEFAULT_BUFFER_SIZE;
  }

  var self = this;
  Writable.call(self, {});
  self.decoder = new ebml.Decoder();

  // defaults to 10MB cyclic video buffer
  self._buffer = new Buffer(bufferSize);
  self._writeHead  = 0;
  self._firstByte  = 0;
  self._totalBytes = 0;

  var initSeg = null;
  var ebmlStart = -1; 
  var ebmlEnd = -1; 
  var cluster = null;
  var timecode = [0, 0];
  var hadSeekHead = false;

  // start of Initialization Segment
  self.decoder.on('EBML', function(data) {
    initSeg = null;
    ebmlStart = data.start;
    ebmlEnd = data.end;
    cluster = null;
    timecode[0] = timecode[1] = 0;
  }); 
  self.decoder.on('SeekHead', function(data) {
    hadSeekHead = true;
    initSeg = self._getBufferData(ebmlStart, data.start);
  }); 
  self.decoder.on('Info:end', function(data) {
    if (hadSeekHead) {
      initSeg = Buffer.concat([initSeg,
        self._getBufferData(data.start, data.end)]);
    } else {
      initSeg = self._getBufferData(ebmlStart, data.end);
    }
  }); 
  self.decoder.on('Tracks:end', function(data) {
    initSeg = Buffer.concat([initSeg,
      self._getBufferData(data.start, data.end)]);
    self.emit('Initialization Segment', initSeg);
  });
  // end of Initialization Segment

  self.decoder.on('Timecode', function(data) {
    // grab the timecode of this cluster
    var startTime = 0,
      bytes = data.dataSize,
      dataView = new Uint8Array(data.data);
    for (var ii = 0; ii < bytes; ii++)
      startTime |= (dataView[ii] << 8*(bytes-ii-1));

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
          cluster: self._getBufferData(data.start, data.end),
          timecode: timecode[0],
          duration: -1
        });
      } else {
        // wait until duration is known
        cluster = self._getBufferData(data.start, data.end);
      }
    }
  });

}

require('util').inherits(WebMByteStream, Writable);

WebMByteStream.prototype._write = function(chunk, enc, done) {
  var self = this;

  // store a subset of the webm in a circular buffer
  var max = self._buffer.length - self._writeHead;
  if (chunk.length > max) {
    // we have to split the chunk in 2
    chunk.copy(self._buffer, self._writeHead, 0, max);
    self._totalBytes += max;
    self._firstByte = self._totalBytes;
    // copy second half
    chunk.copy(self._buffer, 0, max, chunk.length);
    self._totalBytes += (chunk.length - max);
    self._writeHead = (chunk.length - max);
  } else {
    // we can just copy the data to the buffer
    chunk.copy(self._buffer, self._writeHead);
    self._totalBytes += chunk.length;
    self._writeHead += chunk.length;
  }

  self.decoder.write(chunk);

  done();
};

WebMByteStream.prototype._getBufferData = function(start, end) {
  var self = this;

  var bytes = end - start;
  var buffer = new Buffer(bytes);

  var readHead = start%(self._buffer.length);
  var max = self._buffer.length - readHead;
  if (bytes > max) {
    // need to make 2 copies
    self._buffer.copy(buffer, 0, readHead, self._buffer.length);
    self._buffer.copy(buffer, max, 0, bytes - max);
  } else {
    // copy the data into buffer
    self._buffer.copy(buffer, 0, readHead, readHead + bytes);
  }

  return buffer;
  
};

module.exports = WebMByteStream;
