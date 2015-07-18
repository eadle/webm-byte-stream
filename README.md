# webm-byte-stream
Node module that emits Initialization Segments and Media Segments.

# example

``` js
var WebMByteStream = require('webm-byte-stream');

var webmstream = new WebMByteStream({durations: true});

webmstream.on('Initialization Segment', function(data) {
  var initseg = data;
  console.log('Initialization Segment: ' + initseg.length + ' bytes');
});
webmstream.on('Media Segment', function(data) {
  var cluster = data.cluster,
      timecode = data.timecode,
      duration = data.duration;
});
```
