#!/usr/bin/nodejs

var fs = require('fs');
var tmp = require('tmp');
var exec = require('child_process').exec;

var ldap = require('ldapjs');

var config = require('./config.js');

var Monitor = require('./lib/monitor.js');
var prodmon = Monitor.createMonitor(config.prod);
var testmon = Monitor.createMonitor(config.test);

var used_attrs = ['accountDeliveryMessage', 'accountRestrictive', 'accountStatus', 'cn', 'cpf', 'datanascimento', 'deliveryMode', 'description', 'dn', 'employeeNumber', 'employeeType',
		  'gidNumber', 'givenName', 'homeDirectory', 'homePhone', 'jpegPhoto', 'loginShell', 'mail', 'mailAlternateAddress', 'mailForwardingAddress', 'mailSenderAddress',
		  'memberUid', 'mobile', 'o', 'objectClass', 'participantCanSendMail', 'phpgwAccountExpires', 'phpgwAccountLastLogin', 'phpgwAccountLastLoginFrom', 'phpgwAccountStatus',
		  'phpgwAccountType', 'phpgwAccountVisible', 'phpgwLastPasswdChange', 'postalAddress', 'rg', 'rgUf', 'sn', 'telephoneNumber', 'uid', 'uidNumber', 'userPassword',
		  'structuralObjectClass', 'entryUUID', 'creatorsName', 'createTimestamp', 'userPassword', 'phpgwLastPasswdChange', 'entryCSN', 'modifiersName', 'modifyTimestamp'];

var proxy = require('./lib/opers.js').Proxy;

function ufvjm_get_test_dn(entry, ou) {

    if (entry.gidNumber == 1919)
	ou = 'setores,ou=usuarios';
    else if (entry.phpgwAccountType == 'l')
	ou = 'listas,ou=usuarios';
    else if (!ou)
	ou = 'novosusuarios,ou=usuarios';

    return 'uid=' + entry.uid + ',ou='+ou+',dc=ufvjm,dc=edu,dc=br';
}

function ldif_add_entries(entries) {
    var ldif = [];
    for (var i = 0; i < entries.length; i++) {
	var entry = {};

	// filter used attributes
	for (attr in entries[i].object) {
	    if (used_attrs.indexOf(attr) > -1)
		entry[attr] = entries[i].object[attr];
	}

	ldif.push(ldif_add_entry(entry));
    }

    return ldif.join("\n");
}

function ldif_add_entry (entry) {
    var ldif = '';
    var dn = 'dn: ' + ufvjm_get_test_dn(entry) + "\n";
    var objectclass = [];

    for (var i = 0; i < entry.objectClass.length; i++) {
	if (entry.objectClass[i] == 'organizationalPerson')
	    continue;
	objectclass.push('objectClass: ' + entry.objectClass[i]);
    }

    objectclass.push('objectClass: brPerson');
    objectclass.push('objectClass: eduPerson');
    objectclass.push('objectClass: schacPersonalCharacteristics');

    objectclass = objectclass.join("\n") + "\n";
    
    delete entry.dn;
    delete entry.objectClass;
    delete entry.rg;
    delete entry.rgUf;
    delete entry.homePhone;
    delete entry.mobile;

    if (entry.cpf)
	entry.brPersonCPF = entry.cpf;

    for (attr in entry) {
	if (typeof(entry[attr]) == 'array')
	    throw new Error('TEM UM VETOR AQUI NO MEIO');
	else
	    ldif += attr + ': ' + entry[attr] + "\n";
    }
    
    return dn + objectclass + ldif;
}

function ldap_add (entries, callback) {
    console.log('running add oper');
    var filter_uuids = '';

    for (var i = 0; i < entries.length; i++)
	filter_uuids += '(entryUUID=' + entries[i].entryUUID + ')';

    filter_uuids = '(|' + filter_uuids + ')';

    prodmon.list(filter_uuids, used_attrs, function (err, result) {
	if (err) throw err;

	var ldif = ldif_add_entries(result);
	console.log('ldif ready');

	tmp.tmpName({prefix: 'ldapsync-'}, function (err, path) {
	    if (err) throw err;

	    fs.writeFileSync(path, ldif);

	    exec('/usr/sbin/service slapd stop', function (err, stdout, stderr) {
		if (err)
		    return callback(err);

		exec('/usr/sbin/slapadd -l ' + path, function (err, stdout, stderr) {
		    console.log(stderr);
		    if (err) {
			exec('/usr/sbin/service slapd start');
			return callback(err);
		    }

		    exec('/usr/sbin/service slapd start', function (err, stdout, stderr) {
			if (err)
			    return callback(err);

			callback(null);
			fs.unlink(path);
		    });
		});
	    });

	});
    });
}

function ldap_update_entry(client, entry, callback) {
    var opts = {
	scope: 'sub',
	filter: '(uid=' + entry.uid + ')',
	attributes: ['uid', 'dn'],
    };

    var result = null;
    client.search(config.test.monitor.base_dn, opts, function (err, res) {
	res.on('searchEntry', function (entry) {
	    result = entry.object;
	});

	res.on('error', callback);

	res.on('end', function () {
	    var change = new ldap.Change({
	    	operation: 'replace',
	    	modification: {userPassword: entry.userPassword}
	    });

	    client.modify(result.dn, change, callback);
	});
    });
}

function ldap_update (entries, callback) {
    var total = entries.length;
    var fail = 0;
    var done = 0;
    var curr = 0;
    var max = 7;
    var errors = '';

    var client = ldap.createClient({url: config.test.uri});
    client.bind(config.test.credentials.bind_dn, config.test.credentials.bind_pw, function (err) {
	if (err)
	    return callback(err);

	while (curr < max && entries.length > 0) {
	    curr++;
	    var entry = entries.shift();

	    ldap_update_entry(client, entry, function (err) {
		curr--;
		if (err) {
		    fail++;
		    console.log('error updating:', err.message);
		    errors += err.message;
		} else {
		    done++;
		}

		if (entries.length == 0 && curr == 0) {
		    //console.log('update finished');
		    callback(fail, done);
		} else {
		    //console.log('recalling with', entries.length, 'entries');
		    ldap_update(entries, callback);
		}
	    });
	}
    });
}

function launch(oper, callback) {
    console.log('running', oper.type, 'operation:', oper.id);

    if (oper.type == 'add')
	ldap_add(oper.value, function(err) {
	    if (err)
		return callback(err, oper);
	    return callback(null, oper);
	});
    else if (oper.type == 'update') {
	ldap_update(oper.value, function (fail, done) {
	    console.log('update:', fail, 'fail and', done, 'done');
	    if (fail > 0)
		return callback(new Error(fail + ' entries failed to update. ' + done + ' entries updated.'), oper);
	    return callback(null, oper);
	});
    }
}

function check () {
    proxy.get(function (opers) {
	for (var i = 0; i < opers.length; i++) {
	    launch(opers[i], function (err, oper) {
		if (err)
		    return console.error('error running', oper.id + ':', err.message);
		console.log('marking', oper.id, 'as done');
		proxy.done(oper.id);
	    });
	}
    });
}

console.log('Waiting for operations.');
setInterval(check, 7000);
//check();
