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
       console.log(entries.length.toString(), 'removed in production');
	self.emit('entries-to-remove', entries);
    });

    this.prod.on('entries-added', function (entries) {
       console.log(entries.length.toString(), 'added in production');
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
       var ents = [];
       for (var i = 0; i < entries.length; i++) {
           if (self.prod_state.index.indexOf(entries[i].object.entryUUID) > -1)
               ents.push(entries[i]);
       }

       console.log(entries.length.toString(), 'removed in test.', ents.length.toString(), 'needs to be syncked');
       if (ents.length) self.emit('entries-to-add', ents);
    });
};

LDAPSync.prototype.state_loaded_cb = function () {
    if (this.prod_state != null && this.test_state != null) {

	console.log('All servers state loaded. Checking...');
	this.check_state();
    }
};

LDAPSync.prototype.check_entries = function (interval) {
    console.log('[Sync] checking for updates');
    var self = this;

    this.test.check_entries(function (err, test_state, test_added, test_removed) {
       if (err) {
           console.log('Error retrieving test_state:', err.message);
           setTimeout(self.check_entries.bind(self), interval, interval);
           return;
       }

       self.prod.check_entries(function (err, prod_state, prod_added, prod_removed) {
           if (err) {
           console.log('Error retrieving prod_state:', err.message);
               setTimeout(self.check_entries.bind(self), interval, interval);
               return;
           }

           // var removed = test_state.results.filter(function (i) {
           //  return prod_state.index.indexOf(i.object.entryUUID) < 0;
           // });

           // var added = prod_state.results.filter(function (i) {
           //  return test_state.index.indexOf(i.object.entryUUID) < 0;
           // });

           var password_changed = prod_state.results.filter(function (i) {
               var index = test_state.index.indexOf(i.object.entryUUID);
               if (index > -1) {
                   return i.object.userPassword != test_state.results[index].object.userPassword;
               }
               return false;
           });

           // if (removed.length)
           //  self.emit('entries-to-remove', removed);

           // if (added.length)
           //  self.emit('entries-to-add', added);

           if (password_changed.length)
               self.emit('entries-to-update', password_changed);

           setTimeout(self.check_entries.bind(self), interval, interval);
       });
    })
}

LDAPSync.prototype.check_state = function () {
    console.log('prod entries:', this.prod_state.index.length);
    console.log('test entries:', this.test_state.index.length);

    var self = this;

    var removed = this.test_state.results.filter(function (i) {
	return self.prod_state.index.indexOf(i.object.entryUUID) < 0;
    });

    var added = this.prod_state.results.filter(function (i) {
	return self.test_state.index.indexOf(i.object.entryUUID) < 0;
    });

    var password_changed = this.prod_state.results.filter(function (i) {
	var index = self.test_state.index.indexOf(i.object.entryUUID);
	if (index > -1) {
	    return i.object.userPassword != self.test_state.results[index].object.userPassword;
	}
	return false;
    });

    var list_membership_changed = this.prod_state.results.filter(function (i) {
       var index = self.test_state.index.indexOf(i.object.entryUUID);
       if (index > -1 && i.object.mailForwardingAddress) {
           return self.test_state.results[index].object.mailForwardingAddress === undefined
               || i.object.mailForwardingAddress.length != self.test_state.results[index].object.mailForwardingAddress.length;
       }
       return false;
    });

    var list_sender_changed = this.prod_state.results.filter(function (i) {
       var index = self.test_state.index.indexOf(i.object.entryUUID);
       if (index > -1 && i.object.mailSenderAddress) {
           return self.test_state.results[index].object.mailSenderAddress === undefined
               || i.object.mailSenderAddress.length != self.test_state.results[index].object.mailSenderAddress.length;
       }
       return false;
    });

    if (removed.length)
    	this.emit('entries-to-remove', removed);

    if (added.length)
	this.emit('entries-to-add', added);

    if (password_changed.length)
       this.emit('entries-to-update', password_changed);

    if (list_membership_changed.length)
       this.emit('entries-to-update', list_membership_changed);

    if (list_sender_changed.length)
       this.emit('entries-to-update', list_sender_changed);

    console.log('Initial check completed.');
    this.emit('ready');

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
