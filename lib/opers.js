var http = require('http');

var _opers = [];
var _id = 1;

var proxy = {
    request: function (method, path, data, callback) {
	var opts = {
	    hostname: 'localhost',
	    port: 3000,
	    method: method,
	    path: '/api' + path,
	    headers: {
		'Content-Type': 'application/json',
	    },
	};

	var req = http.request(opts, function (res) {
	    var data = '';

	    res.on('data', function (chunk) {
		data += chunk;
	    });

	    res.on('end', function () {
		callback(JSON.parse(data));
	    });
	});

	if (method == 'POST' || method == 'PUT' || method == 'DELETE')
	    req.write(JSON.stringify(data));

	req.end();
    },

    get: function (callback) {
	this.request('GET', '/opers', null, function (data) {
	    callback(data);
	});
    },

    put: function (name, value) {
       //console.log(value.length);
	this.request('POST', '/opers', {type: name, value: value}, function (data) {
	    console.log('proxy: put returned', data.length, 'operations');
	});
    },

    done: function (id) {
	this.request('GET', '/opers/done/' + id, null, function (data) {
	    console.log('proxy: done returned', data.length, 'operations');
	});
    },

    clean: function (callback) {
	this.request('DELETE', '/opers', {id: "all"}, function (data) {
	    callback();
	});
    },
};

module.exports = {
    clean: function () {
	_opers = [];
    },

    put: function(name, value) {
	_opers.push({type: name, value: value, id: _id++, added: new Date()});
    },

    get: function() {
	return _opers.pop();
    },

    find: function (id) {
	for (var i = 0; i < _opers.length; i++)
	    if (_opers[i].id == id) return _opers[i];

	return null;
    },

    index: function (id) {
	for (var i = 0; i < _opers.length; i++)
	    if (_opers[i].id == id) return i;

	return -1;
    },

    count: function() {
	return _opers.length;
    },

    all: function() {
	return _opers.slice();
    },

    done: function(id) {
	var i = this.index(id);
	_opers.splice(i, 1);

	// for (var i = 0; i < _opers.length; i++)
	//     if (_opers[i].id == id) {
	// 	console.log('operation to', _opers[i].type, _opers[i].value.length, 'entries finished.', '(id: ' + id + ')');
	// 	_opers.splice(i, 1);
	//     }
    },

    Proxy: proxy,
}
