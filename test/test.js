var WebMByteStream = require('../index.js'),
    assert = require('assert');

describe('webm-byte-stream', function() {
  describe('WebMByteStream', function() {
    it('should throw for negative bufferSize', function() {
      assert.throws(function() {
        new WebMByteStream({bufferSize: -1});
      }, /bufferSize must be a positive integer/);
    });
    it('should throw for bufferSize that is not a number', function() {
      assert.throws(function() {
        new WebMByteStream({bufferSize: 'o_o'});
      }, /bufferSize must be a positive integer/);
    });
    describe('#_write', function() {
      it('should throw for write size greater than bufferSize', function() {
        assert.throws(function() {
          var webmstream = new WebMByteStream({bufferSize: 3});
              buffer = new Buffer([0xDE, 0xAD, 0xBE, 0xEF]);
          webmstream.write(buffer);
        }, /write size exceeds/);
      });
      it('should wrap around on split write', function() {
        var webmstream = new WebMByteStream({bufferSize: 4}),
            buffer = new Buffer([0xDD, 0xFF, 0xEE]);
        webmstream.write(buffer);
        webmstream.write(buffer);
        var b = webmstream._read(0, 4);
        assert.equal('ffeeeedd', b.readUIntBE(0, 4).toString(16));
      });
    });
    describe('#_read', function() {
      it('should throw for read size greater than bufferSize', function() {
        assert.throws(function() {
          var webmstream = new WebMByteStream({bufferSize: 3});
          webmstream._read(0, 4);
        }, /read size exceeds/);
      });
      it('should wrap around on split read', function() {
        var webmstream = new WebMByteStream({bufferSize: 4}),
            buffer = new Buffer([0xEF, 0xDE, 0xAD, 0xBE]);
        webmstream.write(buffer);
        var b = webmstream._read(9, 13);
        assert.equal('deadbeef', b.readUIntBE(0, 4).toString(16));
      });
    });
  });
});
