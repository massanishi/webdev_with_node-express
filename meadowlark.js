var express = require('express');
var app = express();
var vhost = require('vhost');
// create "admin" subdomain...this should appear
// before all your other routes
var admin = express.Router();
app.use(vhost('admin.*', admin));
// create admin routes; these can be defined anywhere
admin.get('/', function(req, res) {
    res.render('admin/home');
});
admin.get('/users', function(req, res) {
    res.render('admin/users');
});

app.use(require('cors')());

var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');

var credentials = require('./credentials.js');
var cartValidation = require('./lib/cartValidation.js');

var handlebars = require('express3-handlebars').create({
    defaultLayout: 'main',
    helpers: {
        static: function(name) {
            return require('./lib/static.js').map(name);
        }
    }
});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.use(require('body-parser')());
var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({
    url: credentials.mongo.connectionString
});
app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
    store: sessionStore
}));
app.use(express.static(__dirname + '/public'));


app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

// Not related with subdomain. It's error domain
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

var autoViews = {};
var fs = require('fs');
app.use(function(req, res, next) {
    var path = req.path.toLowerCase();
    // check cache; if it's there, render the view
    if (autoViews[path]) return res.render(autoViews[path]);
    // if it's not in the cache, see if there's
    // a .handlebars file that matches
    if (fs.existsSync(__dirname + '/views' + path + '.handlebars')) {
        autoViews[path] = path.replace(/^\//, '');
        return res.render(autoViews[path]);
    }
    // no view found; pass on to 404 handler
    next();
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

require('./routes.js')(app);

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

var Attraction = require('./models/attraction.js');
app.get('/api/attractions', function(req, res) {
    Attraction.find({
        approved: true
    }, function(err, attractions) {
        if (err) return res.send(500, 'Error occurred: database error.');
        res.json(attractions.map(function(a) {
            return {
                name: a.name,
                id: a._id,
                description: a.description,
                location: a.location,
            };
        }));
    });
});
app.post('/api/attraction', function(req, res) {
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: {
            lat: req.body.lat,
            lng: req.body.lng
        },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date(),
        },
        approved: false,
    });
    a.save(function(err, a) {
        if (err) return res.send(500, 'Error occurred: database error.');
        res.json({
            id: a._id
        });
    });
});
app.get('/api/attraction/:id', function(req, res) {
    Attraction.findById(req.params.id, function(err, a) {
        if (err) return res.send(500, 'Error occurred: database error.');
        res.json({
            name: a.name,
            id: a._id,
            description: a.description,
            location: a.location,
        });
    });
});

// website routes go here
// define API routes here with rest.VERB....
// API configuration
var apiOptions = {
    context: '/api',
    domain: require('domain').create(),
};

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