var io = require('./io');
var templates = require('./templates');
var ObjectId = require('modm').ObjectId;

function createRequest (method, link) {

    var data = link.data || {};

    // template id is mandatory
    if (!data.t) {
        return;
    }

    var request = {
        role: link.session._rid,
        options: {},
        templateId: data.t
    };

    // query
    request.query = data.q || {};
    request.query._tp = data.t;

    // update
    if (data.d && data.d.constructor.name === 'Object') {

        // set type
        if (method === 'insert') {
            data.d._tp = ObjectId(data.t);
        }

        request.data = data.d;
    }

    // options
    if (data.o && data.o.constructor.name === 'Object') {
        request.options = data.o;
    }

    // fields
    if (data.f && data.f.constructor.name === 'Object') {
        request.options.fields = data.f;
    }

    return request;
}

var CORE_KEY_REGEXP = new RegExp(/^(_ln\.)?(_id|_tp)$/);

function recursiveConvert(obj, all) {

    // if array of objects (array )
    if (obj.constructor.name === 'Array') {
        for (var i in obj) {
            recursiveConvert(obj[i], all);
        }
        return;
    }

    // if object
    if (typeof obj === 'object') {
        for (var key in obj) {
            if (obj[key] === null || obj[key] === undefined) {
                continue;
            }

            // are we talking business here?
            var isMatch = CORE_KEY_REGEXP.test(key) || all;

            if (typeof obj[key] === 'string' && isMatch) {
                obj[key] = ObjectId(obj[key]);
                continue;
            }

            // treat array here in order not to loose the reference
            if (obj[key].constructor.name === 'Array') {
                if (typeof obj[key][0] === 'object') {
                    recursiveConvert(obj[key], isMatch);
                } else if (isMatch) {
                    for (var i in obj[key]) {
                        obj[key][i] = new ObjectId(obj[key][i]);
                    }
                }
                continue;
            }

            if (typeof obj[key] === 'object') {
                recursiveConvert(obj[key], isMatch);
            }
        }
    }
}

module.exports = function (method, link) {

    if (!io[method]) {
        return link.send(501, 'Method not implemented');
    }

    // check parameters
    var request = createRequest(method, link);

    if (!request) {
        return link.send(400, 'Bad request.');
    }

    // get template (cache)
    templates.getTemplate(request, function (err, request) {

        if (err) {
            return link.send(err.statusCode || 500, err.message);
        }

        try {
            recursiveConvert(request.query);
        } catch (err) {
            return link.send(400, 'Incorrect ObjectId format');
        }
        
        // do input/output
        io[method](link, request);
    });
};
