var assert = require('assert');
var ldap = require('ldapjs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var check_attrs = ['dn', 'uid', 'gidNumber', 'userPassword', 'phpgwAccountType', 'mailForwardingAddress', 'mailSenderAddress', 'entryUUID', 'createTimestamp'];

var Monitor = function (config) {
    this.uri = config.uri;
    this.credentials = config.credentials;
    this.search = config.monitor;
    
    this.state = {
	results: [],
	index: [],
	last_create_timestamp: null
    };

    this.timer_id = null;
};

util.inherits(Monitor, EventEmitter);

Monitor.prototype.start = function () {
    var self = this;
    console.log('connecting to ' + this.uri + '...');

    this.client = ldap.createClient({url: this.uri});

    this.client.bind(this.credentials.bind_dn, this.credentials.bind_pw, function(err) {
	if (err)
	    return self.emit('error', err);

	console.log(self.client.url.host + ' ready!');
	self.check();
    });
};

Monitor.prototype.check_entries = function (callback) {
    var self = this;

    var opts = {
       scope: 'sub',
       filter: this.search.filter,
       attributes: check_attrs,
    };

    var results = [];
    var index = [];
    var last_create_timestamp = null;

    this.client.search(this.search.base_dn, opts, function (err, res) {
       if (err)
           return callback(err);

       res.on('error', function (err) {
           var error = new Error('LDAP Result error: ' + err.message);
           error.prev = err;
           callback(error);
       });

       res.on('searchEntry', function (entry) {
           if (last_create_timestamp == null || (entry.object.createTimestamp > last_create_timestamp))
               last_create_timestamp = entry.object.createTimestamp;

           results.push(entry);
           index.push(entry.object.entryUUID);
       });

       res.on('end', function () {
           if (self.state.results.length == 0) {
               self.state.results = results.slice();
               self.state.index = index.slice();
               self.state.last_create_timestamp = last_create_timestamp;
           }

           // var removed = self.state.results.filter(function (i) {
           //  return index.indexOf(i.object.entryUUID) < 0;
           // });

           // var added = results.filter(function (i) {
           //  return self.state.index.indexOf(i.object.entryUUID) < 0;
           // });

           // if (added.length) {
           //  self.state.results = results.slice();
           //  self.state.index = index.slice();
           //  self.state.last_create_timestamp = last_create_timestamp;
           // }

           // if (removed.length) {
           //  self.state.results = results.slice();
           //  self.state.index = index.slice();
           //  self.state.last_create_timestamp = last_create_timestamp;
           // }

           callback(null, {results: results, index: index, last_create_timestamp: last_create_timestamp});
       });
    });
}

Monitor.prototype.check = function () {
    var self = this;

    var opts = {
    	scope: 'sub',
	filter: this.search.filter,
       attributes: check_attrs,
    };

    var results = [];
    var index = [];
    var last_create_timestamp = null;

    this.client.search(this.search.base_dn, opts, function (err, res) {
	if (err)
	    return self.emit('error', err);

	res.on('error', function (err) {
	    var error = new Error('LDAP Result error: ' + err.message);
	    error.prev = err;
	    self.emit('error', error);
	});

	res.on('searchEntry', function (entry) {
	    if (last_create_timestamp == null || (entry.object.createTimestamp > last_create_timestamp))
    		last_create_timestamp = entry.object.createTimestamp;
	    
	    results.push(entry);
	    index.push(entry.object.entryUUID);
	});

	res.on('end', function () {
	    if (self.state.results.length == 0) {
		self.state.results = results.slice();
		self.state.index = index.slice();
		self.state.last_create_timestamp = last_create_timestamp;

		self.emit('results-loaded', self.state);
	    }

	    var removed = self.state.results.filter(function (i) {
		return index.indexOf(i.object.entryUUID) < 0;
	    });

	    var added = results.filter(function (i) {
	    	return self.state.index.indexOf(i.object.entryUUID) < 0;
	    });

	    if (added.length) {
		self.state.results = results.slice();
		self.state.index = index.slice();
		self.state.last_create_timestamp = last_create_timestamp;

		//console.log('added', added);
	
	    	self.emit('entries-added', added);
	    }

	    if (removed.length) {
		self.state.results = results.slice();
		self.state.index = index.slice();
		self.state.last_create_timestamp = last_create_timestamp;

		//console.log('removed', removed);

	    	self.emit('entries-removed', removed);
	    }

	    self.timer_id = setTimeout(self.check.bind(self), self.search.interval);
	});
    });
}

Monitor.prototype.stop = function () {
    this.client.unbind();

    if (this.timer_id)
       clearTimeout(this.timer_id);

    this.state.results = [];
    this.state.index = [];
    this.state.last_create_timestamp = null;
};

Monitor.prototype.list = function (filter, attrs, callback) {
    var self = this;
    var results = [];

    this.client = ldap.createClient({url: this.uri});
    this.client.bind(this.credentials.bind_dn, this.credentials.bind_pw, function(err) {
	if (err)
	    return callback(err);

	var opts = {
    	    scope: 'sub',
	    filter: filter,
    	    attributes: attrs,
	};

	self.client.search(self.search.base_dn, opts, function (err, res) {
	    if (err)
		return callback(err);

	    res.on('error', function (err) {
		return callback(err);
	    });

	    res.on('searchEntry', function (entry) {
		results.push(entry);
	    });

	    res.on('end', function () {
		callback(null, results);
		self.client.unbind();
	    });
	});
    });
};

Monitor.prototype.update = function (entries, callback) {
    var self = this;

    this.client = ldap.createClient({url: this.uri});
    this.client.bind(this.credentials.bind_dn, this.credentials.bind_pw, function(err) {
	console.log('bound to ldap');

	for (var i = 0; i < entries.length; i++) {
	    self.client.modify(entries[i].dn, new ldap.Change(entries[i].change), function (err) {
		if (err)
		    console.error('Error updating', this.dn + ':', err.message);
	    }.bind(entries[i]));
	}

	//self.client.unbind();
    });
};

module.exports = {
    createMonitor: function (config) {
	return new Monitor(config);
    }
};
