function SendQueue(twitterBackend) {
  this.twitterBackend = twitterBackend;
  this.queue = [];
  this.waitingSendResponse = false;

  this.onQueueEmptyCallback = null;
  this.onTweetEnqueuedCallback = null;
  this.onTweetSentCallback = null;
}
SendQueue.prototype = {
  enqueueTweet: function(message, replyId) {
    if(this._isDuplicate(message)) {
      return;
    }
    var queuedTweet = new QueuedTweet(this.twitterBackend, message, replyId);
    this.queue.push(queuedTweet);
    this._safeCallbackCall(this.onTweetEnqueuedCallback, queuedTweet, this.queue.length);
    this._sender();
  },

  queueSize: function() {
    return this.queue.length;
  },

  onQueueEmpty: function(onQueueEmptyCallback) {
    this.onQueueEmptyCallback = onQueueEmptyCallback;
  },

  onTweetEnqueued: function(onTweetEnqueuedCallback) {
    this.onTweetEnqueuedCallback = onTweetEnqueuedCallback;
  },

  onTweetSent: function(onTweetSentCallback) {
    this.onTweetSentCallback = onTweetSentCallback;
  },

  _safeCallbackCall: function(callbackFunc) {
    if(callbackFunc) {
      try {
        var args = Array.prototype.slice.call(arguments);
        callbackFunc.apply(this, args.slice(1, args.length - 1));
      } catch(e) {
        /* ignoring */
      }
    }
  },

  _isDuplicate: function(message) {
    for(var i = 0, len = this.queue.length; i < len; ++i) {
      if(this.queue[i].message == message) {
        return true;
      }
    }
    return false;
  },

  _unqueueTweet: function() {
    if(this.queue.length > 0) {
      this.queue.splice(0, 1);
    }
  },

  _sender: function() {
    if(this.queue.length == 0) {
      this._safeCallbackCall(this.onQueueEmptyCallback);
      return;
    }
    if(this.waitingSendResponse) {
      return;
    }
    this.waitingSendResponse = true;

    var _this = this;
    var tweetToSend = this.queue[0];
    tweetToSend.send(function(success, data, status) {
      _this.waitingSendResponse = false;
      var nextRequestWaitTime = 0;

      if(!success && status && status.match(/duplicate/)) {
        success = true;
      }
      if(success) {
        _this._unqueueTweet();
        _this._safeCallbackCall(_this.onTweetSent, tweetToSend, _this.queue.length);
      } else {
        if(tweetToSend.shouldCancel) {
          _this._unqueueTweet();
        } else {
          // Too bad, something went wrong.
          if(status.match(/timeout/)) {
            // If it's a timeout let's wait a few seconds before issuing another request
            nextRequestWaitTime = 3000;
          }
          tweetToSend.lastStatus = status;
        }
      }
      setTimeout(function() {
        _this._sender();
      }, nextRequestWaitTime);
    });
  }
};

function QueuedTweet(twitterBackend, message, replyId) {
  this.twitterBackend = twitterBackend;
  this.message = message;
  this.replyId = replyId;
  this.createdAt = null;
  this.lastStatus = null;
  this.lastRetry = null;
  this.retryCount = 0;
  this.shouldCancel = false;
}
QueuedTweet.prototype = {
  send: function(callback) {
    if(!this.createdAt) {
      this.createdAt = new Date();
    }
    this.lastRetry = new Date();
    this.retryCount += 1;
    this.twitterBackend.tweet(callback, this.message, this.replyId);
  },
  cancel: function() {
    this.shouldCancel = true;
  }
};