var WebMByteStream = require('../index.js'),
    fs = require('fs');

var input = fs.createReadStream(
  __dirname + '/../media/test.webm', {flags: 'r'}
);

input.on('data', function(data) {
  webmstream.write(data);
});

var webmstream = new WebMByteStream({
  durations: true  // false by default
});

webmstream.on('Initialization Segment', function(data) {
  var initSegment = data;
  console.log('Initialization Segment: length=' + initSegment.length);
});

webmstream.on('Media Segment', function(data) {
  var cluster = data.cluster,
      timecode = data.timecode,
      duration = data.duration;
  console.log('Media Segment: timecode=' + timecode + ', duration='
    + duration + ', length=' + cluster.length);
});
