# webm-byte-stream
Node module that emits Initialization Segments and Media Segments.

## Install

npm install --save webm-byte-stream

## Example

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
## Format

In order to use this module, your encoding must place a keyframe at the beginning of each cluster. See the [specification](https://w3c.github.io/media-source/webm-byte-stream-format.html) for more details about the WebM Byte Stream Format.

## Contributing

This has only been tested for livestreaming WebM. If you need support for seekable WebM, please create an [issue](https://github.com/siphontv/webm-byte-stream/issues) or pull request and I'll spend some time on it.
