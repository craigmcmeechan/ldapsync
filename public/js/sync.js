var operations = null;

function update_operations() {
    $.get('/api/opers', function (data, status) {
	var ul = $('#operations');
	operations = data;

	if (data.length == 0) {
	    ul.append($('<li>').text('Servers already in sync'));
	} else {
	    for (var i = 0; i < data.length; i++) {
		var li = $('<li>').html($('<span>').text(data[i].type + ' ' + data[i].value.length + ' entries'));
		var link = $('<a>');
		link.addClass('btn btn-info').text('Run');
		link.attr({href: '/api/opers/run/' + data[i].id});
		li.append(link);
		ul.append(li);
	    }
	}
    });
}

function execute_operation(index) {
    var oper = operations[index];


}

$(document).ready(function () {
    //setInterval(update_operations, 1000);
    update_operations();
});
