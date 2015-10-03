'use strict';

var fs = require('fs'),
    net = require('net'),
    WebMByteStream = require('../index.js');


var streamCount = 0;
var out = null;

var initSegment = null;
var clusters = [];
var webmstream = new WebMByteStream();

webmstream.on('Initialization Segment', function(data) {
  console.log('initialization segment: length=' + data.length + ' bytes');
  out.write(data);
});

var cluster = 0;
webmstream.on('Media Segment', function(data) {
  console.log('media segment: length=' + data.cluster.length + ' bytes');
  if (cluster%2 != 0) {
    out.write(data.cluster);
  }
  cluster++;
});


var port = 9001;
net.createServer(function(sock) {
  console.log('FFmpeg connected');

  out = fs.createWriteStream('media/stream-' + streamCount + '.webm');
  streamCount++;

  sock.on('data', function(data) {
    if (null !== data) {
      webmstream.write(data);
    }   
  }); 

  sock.on('close', function(data) {
    console.log('FFmpeg disconnected... Resetting WebMByteStream...');
    webmstream.reset();
  }); 

}).listen(port);
console.log('Listening for FFmpeg data on ' + port + '...');
