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

function convertToObjectId (request) {
    try {
        // convert _id to MongoDB's ObjectId
        if (request.query._id) {

            // convert with operators
            if (typeof request.query._id === 'object') {
                for (var op in request.query._id) {
                    for (var i = 0, l = request.query._id[op].length; i < l; ++i) {
                        request.query._id[op][i] = ObjectId(equest.query._id[op][i]);
                    }
                }
            } else {
                request.query._id = ObjectId(request.query._id);
            }
        }

        // convert _tp to MongoDB's ObjectId
        if (request.query['_tp']) {
            request.query['_tp'] = ObjectId(request.query['_tp']);
        }

        // convert _ln._id to MongoDB's ObjectId
        if (request.query['_ln._id']) {
            request.query['_ln._id'] = ObjectId(request.query['_ln._id']);
        }

        // convert _ln._tp to MongoDB's ObjectId
        if (request.query['_ln._tp']) {
            var tp = request.query['_ln._tp'];
            for (var i in tp) {
                tp[i] = ObjectId(tp[i]);
            }
        }

        // convert _ln.$elemMatch keys to MongoDB's ObjectId
        /*if (request.query['_ln']['$elemMatch']) {
            var elemMatch = request.query['_ln']['$elemMatch'];
            for (var i in elemMatch) {
                if (['_id', '_tp'].indexOf(i) > -1) {
                    elemMatch[i] = ObjectId(elemMatch[i]);
                }
            }
        }*/

        return request;
    } catch (err) {
        return;
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

        request = convertToObjectId(request);
        
        if (!request) {
            return link.send(400, 'Incorrect ObjectId format');
        }
        
        // do input/output
        io[method](link, request);
    });
};
