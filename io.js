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

function sendJointResult (link, result, sort, callback) {
    
    var items = [];
    
    for (var i = 0, l = result.length; i < l; ++i) {
        if (result[i]) {
            items.push(result[i]);
        }
    }
    
    // sort result
    if (sort && (sort = sort[0])) {
        
        sort[0] = sort[0].split('.');
        
        items.sort(function compare(a,b) {
            
            for (var i = 0, l = sort[0].length; i < l; ++i) {
                if (a[sort[0][i]]) {
                    a = a[sort[0][i]];
                }
                
                if (b[sort[0][i]]) {
                    b = b[sort[0][i]];
                }
            }
            
            if (a < b) {
                return (sort[1] * -1);
            }
            
            if (a > b) {
                return sort[1];
            }
            
            return 0;
        });
    }
    
    callback ? callback(err, result) : link.send(200, items);
}

function jointRequest (dbReq, jointDbReq, link, result, callback) {
    jointDbReq.template.collection.find(jointDbReq.query, jointDbReq.options, function (err, cursor) {
        
        // ignore query when no items in result
        if (result.length === 0) {
            if (++current === dbReq.jointsLength) {
                sendJointResult(link, result, dbReq.options.sort, callback);
            }
            return;
        }
        
        if (err) {
            if (++current === dbReq.jointsLength) {
                sendJointResult(link, result, dbReq.options.sort, callback);
            }
        }
        
        cursor.toArray(function (err, jointResult) {
        
            if (err) {
                if (++current === dbReq.jointsLength) {
                    sendJointResult(link, result, dbReq.options.sort, callback);
                }
            }
            
            // set empty result if no items found
            if (jointResult.length === 0) {
                result = [];
                if (++current === dbReq.jointsLength) {
                    sendJointResult(link, result, dbReq.options.sort, callback);
                }
            }
            
            // create joint object
            var jointData = {};
            for (var i = 0, l = jointResult.length; i < l; ++i) {
                jointData[jointResult[i]._id] = jointResult[i];
            }
            
            // merge linkd data
            for (var i = 0, l = result.length; i < l; ++i) {
                
                if (
                    result[i] && 
                    result[i][jointDbReq.merge] &&
                    jointData[result[i][jointDbReq.merge]] &&
                    jointData[result[i][jointDbReq.merge]]._id.toString() === result[i][jointDbReq.merge].toString()
                ) {
                    // merge linked data in result field
                    result[i][jointDbReq.merge] = jointData[result[i][jointDbReq.merge]];
                } else {
                    result[i] = null;
                }
            }
            
            if (++current === dbReq.jointsLength) {
                sendJointResult(link, result, dbReq.options.sort, callback);
            }
        });
    });
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
            dbReq.joints[joint].query._id = {$in: []};
            for (var i = 0, l = result.length; i < l; ++i) {
                if (!uniqueId[result[i][dbReq.joints[joint].merge]] && result[i][dbReq.joints[joint].merge]) {
                    uniqueId[result[i][dbReq.joints[joint].merge]] = 1;
                    dbReq.joints[joint].query._id.$in.push(result[i][dbReq.joints[joint].merge]);
                }
            }
            
            // get linked data
            jointRequest(dbReq, dbReq.joints[joint], link, result, callback);
        }
    });
}

// read
exports.find = function (link, dbReq, callback) {
    
    // get data and count
    dbReq.template._crud.collection.find(dbReq.query, dbReq.options, function (err, cursor) {
        dbReq.template._crud.collection.count(dbReq.query, function (countErr, count) {
            
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
    
    dbReq.template._crud.collection.update(dbReq.query, dbReq.data, dbReq.options, function (err, updItem) {
        response(link, err, updItem, callback);
    });
};

exports.insert = function (link, dbReq, callback) {
    
    dbReq.template._crud.collection.insert(dbReq.data, dbReq.options, function (err, newItem) {
        response(link, err, newItem, callback);
    });
};

exports.remove = function (link, dbReq, callback) {

    dbReq.template._crud.collection.remove(dbReq.query, dbReq.options, function (err, numOfRmDocs) {
        response(link, err, numOfRmDocs, callback);
    });
};
