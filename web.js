#!/usr/bin/nodejs

var express = require('express');
var parser = require('body-parser');

var config = require('./config.js');
var operations = require('./lib/opers.js');



var oper_api = express.Router();
oper_api.get('/opers', function (req, res) {
    res.json(operations.all());
});

oper_api.delete('/opers', function (req, res) {
    operations.clean();
    res.json({message: 'all cleaned up!'});
});

oper_api.post('/opers', function (req, res) {
    operations.put(req.body.type, req.body.value);
    res.json(operations.all());
});

oper_api.get('/opers/done/:id', function (req, res) {
    operations.done(req.params.id);
    res.json(operations.all());
});

var app = express();

app.use(parser.json());

app.use('/api', oper_api);

app.use('/javascript', express.static('/usr/share/javascript'));
app.use(express.static(__dirname + '/public'));

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.get('/', function(req, res) {
    res.render('index.jade', {title: 'Husvnivs'});
});

app.listen(3000, function () {
    console.log('Listening on port 3000');
});
