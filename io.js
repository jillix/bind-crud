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
                        
                        // create joint object
                        var jointData = {};
                        for (var i = 0, l = jointResult.length; i < l; ++i) {
                            jointData[jointResult[i]._id] = jointResult[i];
                        }
                        
                        // merge linkd data
                        for (var i = 0, l = result.length; i < l; ++i) {
                            for (var field in jointDbReq.merge) {
                                
                                if (result[i][field]) {
                                    
                                    // set and emtpy object if no jointResults are found
                                    if (jointResult.length === 0) {
                                        result[i][field] = {};
                                        
                                    // find id in joint results
                                    } else if (jointData[result[i][field]] && jointData[result[i][field]]._id.toString() === result[i][field].toString()) {
                                        // merge linked data in result field
                                        result[i][field] = jointData[result[i][field]];
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

// read
exports.find = function (link, dbReq, callback) {
    
   // if (!hasAccess(link, dbReq, 1)) { return link.send(403, "Access denied."); }
    
    // get data and count
    dbReq.template.collection.find(dbReq.query, dbReq.options, function (err, cursor) {
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
    
    dbReq.template.collection.update(dbReq.query, dbReq.data, dbReq.options, function (err, updItem) {
        response(link, err, updItem, callback);
    });
};

exports.insert = function (link, dbReq, callback) {
    
    dbReq.template.collection.insert(dbReq.data, dbReq.options, function (err, newItem) {
        response(link, err, newItem, callback);
    });
};

exports.remove = function (link, dbReq, callback) {

    dbReq.template.collection.remove(dbReq.query, dbReq.options, function (err, numOfRmDocs) {
        response(link, err, numOfRmDocs, callback);
    });
};
