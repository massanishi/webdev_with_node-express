var main = require('./handlers/main.js');

module.exports = function(app) {

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

    app.get('/', main.home);

    app.get('/about', main.about);

    app.get('/tours/hood-river', function(req, res) {
        res.render('tours/hood-river');
    });

    app.get('/tours/request-group-rate', function(req, res) {
        res.render('tours/request-group-rate');
    });

    app.get('/vacations', function(req, res) {
        Vacation.find({
            available: true
        }, function(err, vacations) {
            var context = {
                vacations: vacations.map(function(vacation) {
                    return {
                        sku: vacation.sku,
                        name: vacation.name,
                        description: vacation.description,
                        price: vacation.getDisplayPrice(),
                        inSeason: vacation.inSeason,
                    }
                })
            };
            res.render('vacations', context);
        });
    });

    var VacationInSeasonListener = require('./models/vacationInSeasonListener.js');
    app.get('/notify-me-when-in-season', function(req, res) {
        res.render('notify-me-when-in-season', {
            sku: req.query.sku
        });
    });
    app.post('/notify-me-when-in-season', function(req, res) {
        VacationInSeasonListener.update({
                email: req.body.email
            }, {
                $push: {
                    skus: req.body.sku
                }
            }, {
                upsert: true
            },
            function(err) {
                if (err) {
                    console.error(err.stack);
                    req.session.flash = {
                        type: 'danger',
                        intro: 'Ooops!',
                        message: 'There was an error processing your request.',
                    };
                    return res.redirect(303, '/vacations');
                }
                req.session.flash = {
                    type: 'success',
                    intro: 'Thank you!',
                    message: 'You will be notified when this vacation is in season.',
                };
                return res.redirect(303, '/vacations');
            }
        );
    });
}