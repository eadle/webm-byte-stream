var WebMByteStream = require('../index.js'),
    fs = require('fs');

var webmstream = new WebMByteStream({
  durations: true,     // false by default
  clearTimecodes: true // false by default
});

var input = fs.createReadStream(__dirname + '/../media/test.webm', {
  flags: 'r'
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

input.on('data', function(data) {
  webmstream.write(data);
});
