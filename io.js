function response (link, err, result, callback) {
    
    if (err) {
        return callback ? callback(err) : link.send(err.statusCode || 500, err.toString());
    }
    
    if(!callback) {
        link.res.headers['content-type'] = 'application/json; charset=utf-8';
    }

    if (result.constructor.name === 'Cursor') {
        
        // send result
        if (result.limitValue < 2) {
            return result.toArray(function (err, result) {
                
                if (!callback) {
                    
                    if (err) {
                        err.statusCode = 500;
                    }
                    
                    if (typeof result[0] === 'undefined' || err) {
                        link.res.headers['content-type'] = 'text/plain';
                    }
                }
                
                callback ? callback(err, result[0]) : link.send(err ? err.statusCode : 200, err ? err.toString(): result[0]);
            });
        }

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

// read
exports.find = function (link, dbReq, callback) {
    dbReq.type.collection.find(dbReq.query, dbReq.options, function (err, cursor) {
        response(link, err, cursor, callback);
    });
};

// write
exports.update = function (link, dbReq, callback) {
    dbReq.type.collection.update(dbReq.query, dbReq.data, dbReq.options, function (err, updItem) {
        response(link, err, updItem, callback);
    });
};

exports.insert = function (link, dbReq, callback) {
    dbReq.type.collection.insert(dbReq.data, dbReq.options, function (err, newItem) {
        response(link, err, newItem, callback);
    });
};

exports.remove = function (link, dbReq, callback) {
    dbReq.type.collection.remove(dbReq.query, dbReq.options, function (err, numOfRmDocs) {
        response(link, err, numOfRmDocs, callback);
    });
};

