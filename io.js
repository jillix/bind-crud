function sendJointResult (result, sort, skip, limit, callback) {

    // build the final items
    var items = [];

    // each result object
    for (var i = 0; i < result.length; ++i) {

        // get the current result object
        var cResult = result[i];

        // if it's null, just continue
        if (cResult === null) { continue; }

        // if it is NOT null, push it
        items.push(cResult);
    }

    // get the count
    var count = items.length;

    // take the part of array that must be sent on the client
    items = items.slice(skip, skip + limit);

    // callback
    callback(null, items, count);
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

                // get the current joint result object
                var cJointResult = jointResult[i];

                // set it in joint data
                jointData[cJointResult._id] = cJointResult;
            }

            // merge linked data
            for (var i = 0, l = result.length; i < l; ++i) {

                // get the current result object
                var cResult = result[i];
                if (
                    cResult &&
                    cResult[jointDbReq.merge] &&
                    jointData[cResult[jointDbReq.merge]] &&
                    jointData[cResult[jointDbReq.merge]]._id.toString() === cResult[jointDbReq.merge].toString()
                ) {
                    // merge linked data in result field
                    cResult[jointDbReq.merge] = jointData[result[i][jointDbReq.merge]];
                } else {
                    result[i] = null;
                }
            }

            callback();
        });
    });
}

function jointResponse (dbReq, cursor, skip, limit, callback) {

    // skip not provided, set it 0
    skip = skip || 0;

    // convert cursor to array
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

            // get the current joint object
            var cJoint = dbReq.joints[joint];

            // set limit to length of result
            cJoint.options.limit = result.length;
            delete cJoint.options.limit;
            delete cJoint.options.skip;

            // get ids from linked fields
            var uniqueId = {};
            cJoint.query._id = {$in: []};
            for (var i = 0, l = result.length; i < l; ++i) {

                // get the current result object
                var cResult = result[i];

                if (!uniqueId[cResult[cJoint.merge]] && cResult[cJoint.merge]) {
                    uniqueId[cResult[cJoint.merge]] = 1;
                    cJoint.query._id.$in.push(cResult[cJoint.merge]);
                }
            }

            // get linked data
            jointRequest(dbReq, cJoint, result, function (err) {

                if (err) {
                    return callback(err);
                }

                if (++current === dbReq.jointsLength) {
                    sendJointResult(result, dbReq.options.sort, skip, limit, callback);
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


    // delete limit
    if (dbReq.joints) {

        // get skip and limit
        var limit = dbReq.options.limit
          , skip  = dbReq.options.skip
          ;

        // then delete them
        delete dbReq.options.limit;
        delete dbReq.options.skip;
    }

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
                return jointResponse(dbReq, cursor, skip, limit, function (err, result, count) {
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
