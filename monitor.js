#!/usr/bin/nodejs

var config = require('./config.js');
var Sync = require('./lib/ldapsync.js');
var sync = Sync.createPollers(config);

var proxy = require('./lib/opers.js').Proxy;

sync.on('error', function (err) {
    if (err.prev && err.prev.name == 'ConnectionError' || err.code && err.code == 'EPIPE') {
	console.log('Connection problem... restarting pollers...');
	setTimeout (function () {
	    sync.stop();
	    setTimeout(function () {
		sync.start();
	    }, 7000);
	}, 7000);
    } else {
	console.error('Sync Error: ' + err.message + '. Stopping.');
	sync.stop();
    }
});

sync.on('entries-to-add', function (entries) {
    console.log(entries.length + ' new entries to add');

    var ents = entries.map(function (entry) {
	return entry.object;
    });

    proxy.put('add', ents);
});

sync.on('entries-to-update', function (entries) {
    console.log(entries.length + ' entries to update');

    var ents = entries.map(function (entry) {
	return entry.object;
    });

    proxy.put('update', ents);
});

proxy.clean(function () {
    sync.start();
});
