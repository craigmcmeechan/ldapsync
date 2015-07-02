#!/usr/bin/nodejs

var fs = require('fs');
var tmp = require('tmp');
var exec = require('child_process').exec;

var ldap = require('ldapjs');

var config = require('./config.js');

var Monitor = require('./lib/monitor.js');
var prodmon = Monitor.createMonitor(config.prod);
var testmon = Monitor.createMonitor(config.test);

var used_attrs = ['accountDeliveryMessage', 'accountRestrictive', 'accountStatus', 'cn', 'cpf', 'datanascimento', 'deliveryMode', 'description', 'dn', 'employeeNumber',
		  'employeeType', 'gidNumber', 'givenName', 'homeDirectory', 'homePhone', 'jpegPhoto', 'loginShell', 'mail', 'mailAlternateAddress', 'mailForwardingAddress',
		  'mailSenderAddress', 'memberUid', 'mobile', 'o', 'objectClass', 'participantCanSendMail', 'phpgwAccountExpires', 'phpgwAccountLastLogin',
		  'phpgwAccountLastLoginFrom', 'phpgwAccountStatus', 'phpgwAccountType', 'phpgwAccountVisible', 'phpgwLastPasswdChange', 'postalAddress', 'rg', 'rgUf', 'sn',
		  'telephoneNumber', 'uid', 'uidNumber', 'userPassword', 'structuralObjectClass', 'entryUUID', 'creatorsName', 'createTimestamp', 'userPassword',
		  'phpgwLastPasswdChange', 'entryCSN', 'modifiersName', 'modifyTimestamp', 'hasSubordinates', 'subschemaSubentry'];

var proxy = require('./lib/opers.js').Proxy;

function ufvjm_get_test_dn(entry, ou) {
    var rdn = null;

    if (entry.gidNumber == 1919) {
	rdn = 'ou';
	ou = 'setores';
    } else if (entry.phpgwAccountType == 'l') {
	rdn = 'cn';
	ou = 'listas';
    } else if (!ou) {
	if (entry.cpf) {
	    rdn = 'uid';
	    ou = 'novosusuarios,ou=usuarios';
	} else {
	    rdn = 'uid';
	    ou = 'semcpf,ou=usuarios';
	}
    }

    return rdn + '=' + entry.uid + ',ou=' + ou + ',dc=ufvjm,dc=edu,dc=br';
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
    //console.log(entry);
    var ldif = null;
    if (entry.gidNumber == 1919)
	ldif = ldif_add_entry_setor(entry);
    else if (entry.phpgwAccountType == 'l')
	ldif = ldif_add_entry_lista(entry);
    else
	ldif = ldif_add_entry_usuario(entry);

    return ldif;
}

function ldif_attribute(name, value) {
    return typeof(value) == 'string' ? name + ': ' + value + "\n" : ldif_array_attribute(name, value);
}

function ldif_array_attribute(name, items) {
    console.log(name, items);
    var result = [];

    for (var i = 0; i < items.length; i++) {
	result.push(name + ': ' + items[i]);
    }

    if (result.length)
	return result.join("\n") + "\n";
    else
	return '';
}

function ldif_add_entry_setor(entry) {
    var ldif = ldif_attribute('dn', ufvjm_get_test_dn(entry));

    //classes
    ldif += ldif_attribute('objectClass', ['organizationalUnit', 'qmailUser', 'namedObject']);

    //mapped
    ldif += ldif_attribute('ou', entry.uid);
    ldif += ldif_attribute('description', entry.cn);
    ldif += ldif_attribute('uid', entry.uid);

    //copied
    ldif += ldif_attribute('userPassword', entry.userPassword);
    ldif += ldif_attribute('mail', entry.mail);
    ldif += ldif_attribute('cn', entry.cn);

    //optional_copied
    if (entry.mailForwardingAddress) ldif += ldif_attribute('mailForwardingAddress', entry.mailForwardingAddress);
    if (entry.deliveryMode) ldif += ldif_attribute('deliveryMode', entry.deliveryMode);
    if (entry.mailAlternateAddress) ldif += ldif_attribute('mailAlternateAddress', entry.mailAlternateAddress);
    if (entry.telephoneNumber) ldif += ldif_attribute('telephoneNumber', entry.telephoneNumber);
    if (entry.mobile) ldif += ldif_attribute('telephoneNumber', entry.mobile);
    if (entry.accountStatus) ldif += ldif_attribute('accountStatus', entry.accountStatus);

    //internal
    ldif += ldif_attribute('createTimestamp', entry.createTimestamp);
    ldif += ldif_attribute('creatorsName', entry.creatorsName);
    ldif += ldif_attribute('entryCSN', entry.entryCSN);
    ldif += ldif_attribute('entryUUID', entry.entryUUID);
    ldif += ldif_attribute('hasSubordinates', entry.hasSubordinates);
    ldif += ldif_attribute('modifiersName', entry.modifiersName);
    ldif += ldif_attribute('modifyTimestamp', entry.modifyTimestamp);
    ldif += ldif_attribute('subschemaSubentry', entry.subschemaSubentry);
    ldif += ldif_attribute('structuralObjectClass', 'organizationalUnit');

    return ldif;
}

function ldif_add_entry_lista(entry) {
    var ldif = ldif_attribute('dn', ufvjm_get_test_dn(entry));
    var classes = ['organizationalRole', 'qmailUser'];

    var mapped = {
	'cn': 'uid',
    };

    var copied = ['mail', 'uid'];
    var optional_copied = ['description', 'deliveryMode', 'accountDeliveryMessage', 'accountRestrictive', 'mailSenderAddress', 'mailForwardingAddress', 'accountStatus',
			  'participantCanSendMail'];

    var internal = ['createTimestamp', 'creatorsName', 'entryCSN', 'entryUUID', 'hasSubordinates', 'modifiersName', 'modifyTimestamp', 'subschemaSubentry'];

    ldif += ldif_attribute('objectClass', classes);
    for (var i in mapped) ldif += ldif_attribute(i, entry[mapped[i]]);
    for (var i = 0; i < copied.length; i++) ldif += ldif_attribute(copied[i], entry[copied[i]]);
    for (var i = 0; i < optional_copied.length; i++) if (entry[optional_copied[i]]) ldif += ldif_attribute(optional_copied[i], entry[optional_copied[i]]);
    for (var i = 0; i < internal.length; i++) ldif += ldif_attribute(internal[i], entry[internal[i]]);
    ldif += ldif_attribute('structuralObjectClass', classes[0]);

    return ldif;
}

function ldif_add_entry_usuario(entry) {
    var ldif = ldif_attribute('dn', ufvjm_get_test_dn(entry));
    var classes = ['inetOrgPerson', 'brPerson', 'radiusProfile'];

    var mapped = {
	'brPersonCPF': 'cpf',
    };

    var copied = ['uid', 'cn', 'sn'];
    var optional_copied = ['userPassword', 'employeeNumber', 'jpegPhoto'];

    if (entry.objectClass.indexOf('qmailUser') > -1) {
	classes.push('qmailUser');
	copied.push('mail');
	optional_copied.push('accountStatus');
	optional_copied.push('mailAlternateAddress');
	optional_copied.push('mailForwardingAddress');
	optional_copied.push('deliveryMode');
    }

    var internal = ['createTimestamp', 'creatorsName', 'entryCSN', 'entryUUID', 'hasSubordinates', 'modifiersName', 'modifyTimestamp', 'subschemaSubentry'];

    ldif += ldif_attribute('objectClass', classes);
    for (var i in mapped) if (entry[mapped[i]]) ldif += ldif_attribute(i, entry[mapped[i]]);
    for (var i = 0; i < copied.length; i++) ldif += ldif_attribute(copied[i], entry[copied[i]]);
    for (var i = 0; i < optional_copied.length; i++) if (entry[optional_copied[i]]) ldif += ldif_attribute(optional_copied[i], entry[optional_copied[i]]);
    for (var i = 0; i < internal.length; i++) ldif += ldif_attribute(internal[i], entry[internal[i]]);

    if (entry.telephoneNumber) ldif += ldif_attribute('telephoneNumber', entry.telephoneNumber);
    if (entry.mobile) ldif += ldif_attribute('telephoneNumber', entry.mobile);
    ldif += ldif_attribute('dialupAccess', 'on');
    ldif += ldif_attribute('structuralObjectClass', classes[0]);

    return ldif;
}

function ldif_add_entry_full(entry) {
    var ldif = '';
    var dn = 'dn: ' + ufvjm_get_test_dn(entry) + "\n";
    var objectclass = [];

    for (var i = 0; i < entry.objectClass.length; i++) {
	if (entry.objectClass[i] == 'organizationalPerson' || entry.objectClass[i] == 'brPerson' || entry.objectClass[i] == 'eduPerson')
	    continue;
	objectclass.push('objectClass: ' + entry.objectClass[i]);
    }

    objectclass.push('objectClass: brPerson');
    objectclass.push('objectClass: eduPerson');

    objectclass = objectclass.join("\n") + "\n";

    var mfa = [];
    if (entry.mailForwardingAddress && typeof(entry.mailForwardingAddress) != 'string') {
	for (var i = 0; i < entry.mailForwardingAddress.length; i++) {
	    mfa.push('mailForwardingAddress: ' + entry.mailForwardingAddress[i]);
	}
	mfa = mfa.join("\n") + "\n";
	delete entry.mailForwardingAddress;
    }

    var msa = [];
    if (entry.mailSenderAddress && typeof(entry.mailSenderAddress) != 'string') {
	for (var i = 0; i < entry.mailSenderAddress.length; i++) {
	    msa.push('mailSenderAddress: ' + entry.mailSenderAddress[i]);
	}
	msa = msa.join("\n") + "\n";
	delete entry.mailSenderAddress;
    }
    
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

    if (mfa.length > 0) {
	return dn + objectclass + mfa + msa + ldif;
    } else {
	return dn + objectclass + ldif;
    }
}

function ldap_add (entries, callback) {
    var filter_uuids = '';

    for (var i = 0; i < entries.length; i++)
	filter_uuids += '(entryUUID=' + entries[i].entryUUID + ')';

    if (entries.length > 1)
	filter_uuids = '(|' + filter_uuids + ')';

    //console.log(filter_uuids);

    prodmon.list(filter_uuids, used_attrs, function (err, result) {
	if (err) throw err;

	if (result.length == 0) throw new Error('Unable to find entry on prod server');

	var ldif = ldif_add_entries(result);
	console.log('ldif ready', ldif);

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
    //console.log(entry);
    var opts = {
	scope: 'sub',
	filter: '(uid=' + entry.uid + ')',
	attributes: ['uid', 'userPassword', 'dn'],
    };

    var result = null;
    client.search(config.test.monitor.base_dn, opts, function (err, res) {
	res.on('searchEntry', function (entry) {
	    result = entry.object;
	});

	res.on('error', callback);

	res.on('end', function () {
           if (!result)
               throw new Error ('Entry not found. Filter: ' + opts.filter);

           var mods = [];

           if (result.userPassword != entry.userPassword) {
               mods.push(new ldap.Change({
                   operation: 'replace',
                   modification: {userPassword: entry.userPassword}
               }));
           }

           if (entry.mailForwardingAddress) {
               mods.push(new ldap.Change({
                   operation: 'replace',
                   modification: {mailForwardingAddress: entry.mailForwardingAddress}
               }));
           }

           if (entry.mailSenderAddress) {
               mods.push(new ldap.Change({
                   operation: 'replace',
                   modification: {mailSenderAddress: entry.mailSenderAddress}
               }));
           }

           client.modify(result.dn, mods, callback);
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

var running = false;
function check () {
    if (running) return;

    proxy.get(function (opers) {
	if (opers.length == 0) return;

	launch(opers[0], function (err, oper) {
	    running = false;
	    if (err)
		return console.error('error running', oper.id + ':', err.message);
	    console.log('marking', oper.id, 'as done');
	    proxy.done(oper.id);
	});
    });
}

// function check () {
//     proxy.get(function (opers) {
// 	for (var i = 0; i < opers.length; i++) {
// 	    launch(opers[i], function (err, oper) {
// 		if (err)
// 		    return console.error('error running', oper.id + ':', err.message);
// 		console.log('marking', oper.id, 'as done');
// 		proxy.done(oper.id);
// 	    });
// 	}
//     });
// }

console.log('Waiting for operations.');
setInterval(check, 7000);
//check();
