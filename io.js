function response (link, err, result, callback) {

    if (err) {
        return callback ? callback(err) : link.send(err.statusCode || 500, err.toString());
    }
    
    if(!callback) {
        link.res.headers['content-type'] = 'application/json; charset=utf-8';
    }

    if (result.constructor.name === 'Cursor') {
        
        if (callback) {
            return callback(null, result);
        }
        
        // stream result
        var stream = result.stream();
        link.stream.start(200);
        
        stream.on('end', function() {
            link.stream.end();
        });

        stream.on('error', function(err) {
            link.stream.error(500, err.toString());
        });

        stream.on('data', function(data) {
            link.stream.data(data);
        });
        
    } else {
        callback ? callback(err, result) : link.send(200, result);
    }
}

function hasAccess (link, req, access) {
    req.template = req.template || { "roles": {} };
    
    if (!link) {
        return true;
    }
    
    if (!link.session || !link.session.crudRole) {
        return false;
    }
    
    if (req.template.roles && req.template.roles[link.session.crudRole] < access) {
        return false;
    }

    return true;
}

// read
exports.find = function (link, dbReq, callback) {
    if (!hasAccess(link, dbReq, 1)) { return link.send(403, "Access denied."); }

    dbReq.template.collection.find(dbReq.query, dbReq.options, function (err, cursor) {
        
        var countOptions = JSON.parse(JSON.stringify(dbReq.options));
        
        delete countOptions.limit;

        dbReq.template.collection.count(dbReq.query, countOptions, function (countErr, count) {
            
            if (link && !countErr) {
                link.res.headers['X-Mono-CRUD-Count'] = count.toString();
            }
            
            response(link, err, cursor, callback);
        });
    });
};

// write
exports.update = function (link, dbReq, callback) {
    if (!hasAccess(link, dbReq, 2)) { return link.send(403, "Access denied."); }
    
    dbReq.template.collection.update(dbReq.query, dbReq.data, dbReq.options, function (err, updItem) {
        response(link, err, updItem, callback);
    });
};

exports.insert = function (link, dbReq, callback) {
    if (!hasAccess(link, dbReq, 2)) { return link.send(403, "Access denied."); }
    
    dbReq.template.collection.insert(dbReq.data, dbReq.options, function (err, newItem) {
        response(link, err, newItem, callback);
    });
};

exports.remove = function (link, dbReq, callback) {
    if (!hasAccess(link, dbReq, 3)) { return link.send(403, "Access denied."); }

    dbReq.template.collection.remove(dbReq.query, dbReq.options, function (err, numOfRmDocs) {
        response(link, err, numOfRmDocs, callback);
    });
};
