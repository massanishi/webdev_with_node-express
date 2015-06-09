var express = require('express');
var app = express();


var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');

var credentials = require('./credentials.js');
var cartValidation = require('./lib/cartValidation.js');

var handlebars = require('express3-handlebars')
    .create({
        defaultLayout: 'main'
    });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.use(require('body-parser')());
app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')());
app.use(express.static(__dirname + '/public'));


app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);


app.use(function(req, res, next) {
    // create a domain for this request
    var domain = require('domain').create();
    // handle errors on this domain
    domain.on('error', function(err) {
        console.error('DOMAIN ERROR CAUGHT\n', err.stack);
        try {
            // failsafe shutdown in 5 seconds
            setTimeout(function() {
                console.error('Failsafe shutdown.');
                process.exit(1);
            }, 5000);
            // disconnect from the cluster
            var worker = require('cluster').worker;
            if (worker) worker.disconnect();
            // stop taking new requests
            server.close();
            try {
                // attempt to use Express error route
                next(err);
            } catch (error) {
                // if Express error route failed, try
                // plain Node response
                console.error('Express error mechanism failed.\n', error.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Server error.');
            }
        } catch (error) {
            console.error('Unable to send 500 response.\n', err.stack);
        }
    });
    // add the request and response objects to the domain
    domain.add(req);
    domain.add(res);
    // execute the rest of the request chain in the domain
    domain.run(next);
});

app.use('/upload', function(req, res, next) {
    var now = Date.now();
    jqupload.fileHandler({
        uploadDir: function() {
            return __dirname + '/public/uploads/' + now;
        },
        uploadUrl: function() {
            return '/uploads/' + now;
        }
    })(req, res, next);
});

app.use(require('./lib/tourRequiresWaiver.js'));

app.use('/newsletter', function(req, res) {
    res.render('newsletter', {
        csrf: 'CSRF token goes here'
    });
});

app.get('/contest/vacation-photo', function(req, res) {
    var now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(),
        month: now.getMonth()
    });
});

app.post('/contest/vacation-photo/:year/:month', function(req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        if (err) return res.redirect(303, '/error');
        console.log('received fields:');
        console.log(fields);
        console.log('received files:');
        console.log(files);
        res.redirect(303, '/thank-you');
    });
});

app.post('/process', function(req, res) {
    if (req.xhr || req.accepts('json,html') === 'json') {
        res.send({
            success: true
        });
    } else {
        console.log('Form (from querystring): ' + req.query.form);
        console.log('CSRF token (from hidden form field): ' + req.body._csrf);
        console.log('Name (from visible form field): ' + req.body.name);
        console.log('Email (from visible from field): ' + req.body.email);
        res.redirect(303, '/thank-you');
    }
});

app.post('/cart/checkout', function(req, res) {
    var cart = req.session.cart;
    if (!cart) next(new Error('Cart does not exist.'));
    var name = req.body.name || '',
        email = req.body.email || '';
    // input validation
    if (!email.match(VALID_EMAIL_REGEX))
        return res.next(new Error('Invalid email address.'));
    // assign a random cart ID; normally we would use a database ID here
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email,
    };
    res.render('email/cart-thank-you', {
        layout: null,
        cart: cart
    }, function(err, html) {
        if (err) console.log('error in email template');

        var emailService = require('./lib/email.js')(credentials);
        emailService.send('joecustomer@gmail.com', 'Hood River tours on sale today!',
            'Get \'em while they\'re hot!');
    });

    res.render('cart-thank-you', {
        cart: cart
    });
});

app.get('/', function(req, res) {
    res.render('home');
});

app.get('/about', function(req, res) {
    res.render('about', {
        fortune: fortune.getFortune(),
        pageTestScript: '/qa/tests-about.js'
    });
});

app.get('/tours/hood-river', function(req, res) {
    res.render('tours/hood-river');
});

app.get('/tours/request-group-rate', function(req, res) {
    res.render('tours/request-group-rate');
});


// Custom 404 page
app.use(function(req, res) {
    res.status(404);
    res.render('404');
});

// Custom 500 page
app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.render('500');
});

switch (app.get('env')) {
    case 'development':
        // compact, colorful dev logging
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        // module 'express-logger' supports daily log rotation
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        break;
}

app.set('port', process.env.PORT || 3000);
// app.listen(app.get('port'), function() {
//     console.log('Express started in ' + app.get('env') + ' mode on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
// });

function startServer() {
    app.listen(app.get('port'), function() {
        console.log('Express started in ' + app.get('env') +
            ' mode on http://localhost:' + app.get('port') +
            '; press Ctrl-C to terminate.');
    });
}
if (require.main === module) {
    // application run directly; start app server
    startServer();
} else {
    // application imported as a module via "require": export function
    // to create server
    module.exports = startServer;
}