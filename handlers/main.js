var fortune = require('../lib/fortune.js');

exports.home = function (req, res) {
	res.render('home');
}

exports.about = function (req, res) {
	res.require('about', {
		fortune: fortune.getFortune(),
		pageTestScript: '/qa/tests.about.js'
	});
};