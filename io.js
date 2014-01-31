function sendJointResult (result, sort, callback) {
    
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
    
    callback(null, result);
}

function jointRequest (dbReq, jointDbReq, result, callback) {
    jointDbReq.template._modm.collection.find(jointDbReq.query, jointDbReq.options, function (err, cursor) {
        
        // ignore query when no items in result
        if (err) {
            return callback(err);
        }
        
        cursor.toArray(function (err, jointResult) {
        
            if (err || jointResult.length === 0) {
                return callback(err);
            }
            
            // create joint object
            var jointData = {};
            for (var i = 0, l = jointResult.length; i < l; ++i) {
                jointData[jointResult[i]._id] = jointResult[i];
            }

            // merge linked data
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
                    result[i][jointDbReq.merge] = '';
                }
            }
            
            callback();
        });
    });
}

function jointResponse (dbReq, cursor, callback) {

    cursor.toArray(function (err, result) {

        if (err) {
            return callback(err);
        }

        // don't merge if no documents are found
        if (result.length === 0) {
            return callback(null, []);
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
            jointRequest(dbReq, dbReq.joints[joint], result, function (err, emtpy) {
                
                if (err) {
                    return callback(err);
                }
                
                if (++current === dbReq.jointsLength) {
                    sendJointResult(result, dbReq.options.sort, callback);
                }
            });
        }
    });
}

// CRUD interface

exports.create = function (dbReq, callback) {
    dbReq.template._modm.collection.insert(dbReq.data, dbReq.options, callback);
};

exports.read = function (dbReq, callback) {
    // get data and count
    dbReq.template._modm.collection.find(dbReq.query, dbReq.options, function (err, cursor) {

        if (err) {
            return callback(err);
        }

        dbReq.template._modm.collection.count(dbReq.query, function (countErr, count) {

            if (countErr) {
                count = -1;
            }

            // merge linked data in result data
            if (dbReq.joints) {
                return jointResponse(dbReq, cursor, function (err, result) {
                    callback(err, result, count);
                });
            }

            callback(null, cursor, count);
        });
    });
};

exports.update = function (dbReq, callback) {
    dbReq.template._modm.collection.update(dbReq.query, dbReq.data, dbReq.options, callback);
};

exports['delete'] = function (dbReq, callback) {
    dbReq.template._modm.collection.remove(dbReq.query, dbReq.options, callback);
};

