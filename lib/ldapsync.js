var Monitor = require('./monitor.js');

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var LDAPSync = function (config) {
    // setting up production server monitor
    this.prod_state = null;
    this.test_state = null;

    this.on('state-loaded', this.state_loaded_cb.bind(this));
    
    this.setup_production(config.prod);
    this.setup_test(config.test);
}

util.inherits(LDAPSync, EventEmitter);

LDAPSync.prototype.setup_production = function (config) {
    var self = this;

    this.prod = Monitor.createMonitor(config);

    this.prod.on('error', function (err) {
	console.error('Production server error. Polling stopped.');
	self.emit('error', err);
	self.prod_state = null;
	self.prod.stop();
    });

    this.prod.on('results-loaded', function (state) {
	self.prod_state = state;
	self.emit('state-loaded');
    });

    this.prod.on('entries-removed', function (entries) {
	self.emit('entries-to-remove', entries);
    });

    this.prod.on('entries-added', function (entries) {
	self.emit('entries-to-add', entries);
    });
};

LDAPSync.prototype.setup_test = function (config) {
    var self = this;

    this.test = Monitor.createMonitor(config);

    this.test.on('error', function (err) {
	console.error('Test server error. Polling stopped.');
	self.emit('error', err);
	self.test_state = null;
	self.test.stop();
    });

    this.test.on('results-loaded', function (state) {
	self.test_state = state;
	self.emit('state-loaded');
    });

    this.test.on('entries-removed', function (entries) {
    	self.emit('entries-to-add', entries);
    });
};

LDAPSync.prototype.state_loaded_cb = function () {
    if (this.prod_state != null && this.test_state != null) {
	console.log('All servers state loaded. Checking...');
	this.check_state();
    }
};

LDAPSync.prototype.check_state = function () {
    console.log('checking', this.prod_state.index.length, this.test_state.index.length);

    var self = this;

    var removed = this.test_state.results.filter(function (i) {
	return self.prod_state.index.indexOf(i.object.entryUUID) < 0;
    });

    var added = this.prod_state.results.filter(function (i) {
	return self.test_state.index.indexOf(i.object.entryUUID) < 0;
    });

    var changed = this.prod_state.results.filter(function (i) {
	var index = self.test_state.index.indexOf(i.object.entryUUID);
	if (index > -1) {
	    return i.object.userPassword != self.test_state.results[index].object.userPassword;
	}
	return false;
    });

    if (removed.length)
    	this.emit('entries-to-remove', removed);

    if (added.length)
	this.emit('entries-to-add', added);

    if (changed.length)
	this.emit('entries-to-update', changed);
};

LDAPSync.prototype.start = function () {
    this.prod.start();
    this.test.start();
}

LDAPSync.prototype.stop = function () {
    this.prod_state = null;
    this.test_state = null;

    this.prod.stop();
    this.test.stop();
}

module.exports = {
    createPollers: function (config) {
	return new LDAPSync(config);
    },
};
