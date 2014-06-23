// get object id
var ObjectId = require ("mongodb").ObjectID;

function getValidItems (result) {

    // build the final items
    var items = [];

    // filter the non-null results
    for (var i = 0; i < result.length; ++i) {
        if (result[i] === null) {
            continue;
        }
        items.push(result[i]);
    }

    return items;
}

/*
 *  e.g. findValue({
 *      a: {
 *          b: {
 *              c: 10
 *          }
 *      }
 *  }, "a.b.c") === 10 // true
 *
 * */
function findValue (parent, dotNot) {

    if (!dotNot || !parent) return undefined;

    var splits = dotNot.split(".");
    var value;

    for (var i = 0; i < splits.length; i++) {
        value = parent[splits[i]];
        if (value === undefined) return undefined;
        if (typeof value === "object") parent = value;
    }

    return value;
}

/*
 *  Returns the data type of value
 *
 *  getDataType(0) -> "Number"
 * */
function getDataType (value) {

    // null
    if (value === null) return "null";

    // undefined
    if (value === undefined) return "undefined";

    // Numbers, Strings , Booleans , Objects , null , undefined , Functions , Arrays , RegExps
    if (value.constructor) {
        return value.constructor.name;
    }
}

function sendJointResult (result, jointMerges, sort, skip, limit, callback) {

    // filter result
    var items = getValidItems (result);

    for (var i = 0; i < sort.length; ++i) {

        // get the current sort array
        // > sort
        //     [ [ 'client.email', 1 ] ]
        var cSort = sort[i]
          , sortField = cSort[0]
          , order = cSort[1]
          ;

        // continue if no sort field or the sort field is not a linked field (native fields are sorted by Mongo)
        // TODO Multiple sort
        if (!sortField || jointMerges.indexOf(sortField.substring(0, sortField.indexOf("."))) === -1) {
            continue;
        }

        // finally sort the items
        items.sort(function (a, b) {

            // find the sort field in items
            var fieldA = findValue(a, sortField) || ""
              , fieldB = findValue(b, sortField) || ""
              ;

            // TODO Is this really required?
            if (getDataType(fieldA) !== getDataType(fieldB)) {

                console.warn(
                    "Different data types:" +
                    "\nFieldA: " + JSON.stringify(fieldA) +
                    "\nFieldB: " + JSON.stringify(fieldB) +
                    "\nSkipping ..." +
                    "\n------------"
                );

                return 1;
            }

            switch (getDataType(fieldA)) {
                // string
                case "String":
                    if (order > 0) {
                        return fieldA.localeCompare(fieldB);
                    } else {
                        return fieldB.localeCompare(fieldA);
                    }
                    break;

                // number
                case "Number":
                    if (order > 0) {
                        return fieldA - fieldB;
                    } else {
                        return fieldB - fieldA;
                    }
                    break;

                // null and undefined
                case "null":
                case "undefined":
                    if (order > 0) {
                        return -1;
                    } else {
                        return 1;
                    }
                    break;

                // date
                case "Date":
                    if (order > 0) {
                        return new Date(fieldA) > new Date(fieldB) ? 1 : -1;
                    } else {
                        return new Date(fieldA) < new Date(fieldB) ? 1 : -1;
                    }
                    break;

                // TODO Other data types?
                default:
                    console.warn(
                        "[Warning!] Unhandled sort data type: ", typeof fieldA,
                        "\nConstructor: ", fieldA.constructor.name,
                        "\nValue: ", JSON.stringify(fieldA, null, 4)
                    );
                    break;
            }
        });
    }

    // get the count
    var count = items.length;

    // set limit value if it's undefined
    if (typeof limit === "undefined") {
        limit = items.length;
    }

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

            if (err) {
                return callback(err);
            }

            // create joint object
            var jointData = {};

            // query has just the _id field
            if (Object.keys(jointDbReq.query).length === 1) {
                jointData["000000000000000000000000"] = {
                    _id: ObjectId ("000000000000000000000000")
                };
            }

            for (var i = 0; i < jointResult.length; ++i) {

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

                    // remove object from result
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

        var current = 0
          , mergedSort = JSON.parse(JSON.stringify(dbReq.options.sort || []))
          , jointMerges = []
          ;

        for (var joint in dbReq.joints) {

            // get the current joint object
            var cJoint = dbReq.joints[joint];

            // merge sorts
            mergedSort = mergedSort.concat(cJoint.options.sort);

            // add the merge joint
            jointMerges.push (cJoint.merge);

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
                    sendJointResult(result, jointMerges, mergedSort, skip, limit, callback);
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
    if (dbReq.template.findAndRemove || dbReq.findAndRemove) {
        dbReq.template._modm.collection.findAndRemove(dbReq.query, dbReq.options, callback);
    } else {
        dbReq.template._modm.collection.remove(dbReq.query, dbReq.options, callback);
    }
};
