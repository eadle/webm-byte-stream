# webm-byte-stream
Node module that emits Initialization Segments and Media Segments.

# example

``` js
var WebMByteStream = require('webm-byte-stream'),
    fs = require('fs');

// Media Segment durations not included by default
var webmstream = new WebMByteStream({durations: true});
webmstream.on('Initialization Segment', function(data) {
  var initseg = data;
  // ...
});
webmstream.on('Media Segment', function(data) {
  var cluster = data.cluster,
      timecode = data.timecode,
      duration = data.duration;
  // ...
});

var file = fs.createReadStream('./test.webm', {flags: 'r'});
file.on('data', function(data) {
	webmstream.write(data);
});
```
