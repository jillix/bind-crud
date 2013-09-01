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

function jointResponse (link, dbReq, cursor, callback) {
    
    cursor.toArray(function (err, result) {
        
        if (err) {
            return callback ? callback(err) : link.send(err.statusCode || 500, err.toString());
        }
        
        // don't merge if no doucments are found
        if (result.length === 0) {
            return callback ? callback(err, result) : link.send(200, result);
        }
        
        var current = 0;
        for (var joint in dbReq.joints) {
            
            // set limit to length of result
            dbReq.joints[joint].options.limit = result.length;
            
            // get ids from linked fields
            var uniqueId = {};
            dbReq.joints[joint].query = {_id: {$in: []}};
            for (var i = 0, l = result.length; i < l; ++i) {
                for (var mergeField in dbReq.joints[joint].merge) {
                    if (!uniqueId[result[i][mergeField]] && result[i][mergeField]) {
                        uniqueId[result[i][mergeField]] = 1;
                        dbReq.joints[joint].query._id.$in.push(result[i][mergeField]);
                    }
                }
            }
            
            // get linked data
            (function (jointDbReq) {
                jointDbReq.template.collection.find(jointDbReq.query, jointDbReq.options, function (err, cursor) {
                    
                    if (err) {
                        return ++crrent;
                    }
                    
                    cursor.toArray(function (err, jointResult) {
                    
                        if (err) {
                            return ++current;
                        }
                        
                        // merge linkd data
                        for (var i = 0, l = result.length; i < l; ++i) {
                            for (var field in jointDbReq.merge) {
                                if (result[i][field]) {
                                    
                                    // set and emtpy object if no jointResults are found
                                    if (jointResult.length === 0) {
                                        result[i][field] = {};
                                        continue;
                                    }
                                    
                                    for (var ii = 0, ll = jointResult.length; i < l; ++i) {
                                        // find id in joint results
                                        if (jointResult[ii]._id.toString() === result[i][field].toString()) {
                                            // merge linked data in result field
                                            result[i][field] = jointResult[ii];
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (++current === dbReq.jointsLength) {
                            callback ? callback(err, result) : link.send(200, result);
                        }
                    });
                });
            })(dbReq.joints[joint]);
        }
    });
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

        // why do we need options for count?
        //var countOptions = JSON.parse(JSON.stringify(dbReq.options));
        //delete countOptions.limit;

        dbReq.template.collection.count(dbReq.query, function (countErr, count) {
            
            if (link && !countErr) {
                link.res.headers['X-Mono-CRUD-Count'] = count.toString();
            }
            
                // merge linked data in result data
            if (!err && dbReq.joints) {
                return jointResponse(link, dbReq, cursor, callback);
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
