crud
====

CRUD for mono

####Example config with flow:

```js
config: {
    myMiid: {
        myEvent: ['read', 'update', 'create', 'delete']
    }
}
```

All these events must have two parameters:

 * the **CRUD object** defined by the CRUD module. See **example request data**.
 * the **callback** to be called with the results when the operation completes.

####Fetch templates

If an array is send to `self.emit('read')` as data CRUD will fetch the templates inside the array.
Normal queries for templates are working also.
Templates are always initialized before returned.

### CRUD object format

- `t` (client) or `templateId` (server): the stringified ObjectID id od this template
- `q` (client) or `query` (server): a query object in MongoDB query format used for `read`, `update`, `delete` operations
- `d` (client) or `data` (server): a data object for `update` or `create` operations. The `update` operation requires the MongoDB update document format, while for the `create` operations this will be interpreted as the document to be created.
- `o` (client) or `options` (server): an options object in the MongoDB NodeJs Driver format that can contain: `fields`, `sort`, `skip`, `limit`, etc. options
- `role` (server): the role in the name of which this request should be made. This usually comes from `link.session.crudRole`. From the client this fiels is not necessary because it will be automatically added on the server side depending on the role of the user making this request.

### Client CRUD requests

#### Example request data:

```js
{
    // the template that this CRUD object will be validated against
    t: 'the stringified template id',
    // the query object in MongoDB format
    q: {/*query object*/},
    // the document object (updates) in MongoDB format
    d: {/*update document*/},
    // the CRUD operation options in node-monogdb-native (NodeJs MongoDb driver) format
    o: {/*options*/},
    // don't make joins
    noJoins: true,
    // don't merge template
    noMerge: true,
    // don't return cursors for read operations
    noCursor: true,
    // perform only a count using the given query
    onlyCount: true
}
```

### Server CRUD requests

#### Example request data:

Build the CRUD request object:

```js
{
    templateId: 'the stringified template id',
    role: ObjectId('the crud role'), // link.session.crudRole
    query: {
        /* query data */
    },
    data: {
        /* data to insert/update */
    },
    noCursor: true // don't return cursors for read operations,
    onlyCount: true // perform only a count using the given query
}
```

and emit a `crud.<operation>` server-side event:

```js
M.emit("crud.create", crudObject, callback);
```

#### Template config

```js
myTemplate = {
    _id: myTemplateItemId,
    _tp: [_templateTemplateId],
    db: 'dbName',
    collection: 'collectionName',
    name: 'template_name',
    roles: {
        // set any combination of c, r, u or d in access
        'roleId': {access: 'crud'},
        // optional template configuration overwriting
        // the only supported template properties are: options, links, and schema
        'config': {
            'options': {
                'html': 'another/html/file.html'
            },
            'links': {
                // ...
            },
            'schema': {
                ...
            }
        }
    },
    // add a role with access rights to every item
    itemAccess: 'crud',
    options: {
        label: {
            de: 'Template Label'
        },
        order: 5,
        html: '/myTemplate.html',
        sort: [['sort.field', 1]],
        // a hidden fixed filter to display only the customers that are HB
        filters: [
            {
                field: 'filterFIeld',
                operator: 'exists',
                value: true,
                hidden: true,
                fixed: true
            }
        ]
    },
    // plug custom code
    on: {
        create: {
            myCustomEventA: [arg1, argN]
        },
        read: {
            myCustomEventB: [arg1, argN]
        },
        update: {
            myCustomEventC: [arg1, argN]
        },
        delete: {
            myCustomEventD: [arg1, argN]
        }
    },

    links: [
        // see crud links module
    ],
    schema: {
        // modm schema
    }
}
```

### Change log

#### `v0.5.1`
 - added `findAndModify` template option for the `update` operation

#### `v0.5.0`
 - transferred the module to the new jxMono organization
 - updated Flow to `v0.2.0`

#### `v0.4.1`
 - Template role handling: always return at least current role in a template document.

#### `v0.4.0`
 - Added `onlyCount` option to find requests
 - Count is no longer performed for every find request

#### `v0.3.8`
 - Fixed template merging for templates that are not fetched by id

#### `v0.3.7`
 - Fixed `templateId` handling to a uniform behavior: always `ObjectID`

#### `v0.3.6`
 - Fixed `read`, `update` and `delete` operations with empty query string that were not adding the `_tp` to the query before executing it.

#### `v0.3.5`
 - Added `init` operation to expose the server side initialization if no other crud operations are needed.

#### `v0.3.4`
 - Added missing sort argument to `findAndRemove` db request.

#### `v0.3.3`
 - Cache `modm` instances. Solves a critical memory leak.

#### `v0.3.2`
 - Fixed a bug from v0.3.1 (undefined is not a function)

#### `v0.3.1`
 - Added public access feature

#### `v0.3.0`
- added the `noCursor` crud read request option to automatically convert all the cursors into array. Default `false`
- fixed the linked field filtering
- sort linked fields using JavaScript sort methods after we have the full result array
- added `noJoins: true` template option to disable linked template joining
- get template requests filter out all roles except the user role
- callback the data after running non-read operations and server events
- emit `request.template.callback` event if this is provided (also, don't call the built-in callback)
- dates are converted using [moment.js](http://momentjs.com/) if this is installed. Dates in valid ISO date format (`YYYY-MM-DDThh:mm:ss.MMM`) will be parsed with the `Date` constructor.
- Introduced `before` and `after` configuration:

    ```js
    {
        before: {
            appId: {
                create: "createEventB",
                read: "readEventB",
                update: "updateEventB",
                delete: "deleteEventB"
            }
        },
        after: {
            appId: {
                create: "createEventA",
                read: "readEventA",
                update: "updateEventA",
                delete: "deleteEventA"
            }
        }
    }
    ```

    or

    ```js
    {
        before: { appId: "catchAllB" },
        after: { appId: "catchAllA" }
    }
    ```

    In server custom scripts we can do:

    ```js
    // before event
    M.on("crud:createEventB", function (request, callback) {
      // do another db request
      foo(request, function (err, data) {
        if (err) { return callback(err); }
        request.query.something = data.something;
        callback(null, request);
      });
    });

    // after event
    M.on("crud:createEventA", function (request, err, data, callback) {
      // handle error message
      // then send the callback
      callback(err, data);
    });
    ```

#### `v0.2.14`
- Fixed wrong behavior when sorting numbers and strings. Related to #29.

#### `v0.2.13`
- Fixed the wrong behavior when sorting dates
- Improved the sort method.

#### `v0.2.12`
- fixed item link bug that was nullifying itms with no linked objects
- `v0.2.11` had to be skipped because of an unprotected object reference and a server installation was already performed

#### `v0.2.10`
- fixed MongoDB connection leak due to template cache bug
- fixed typo in mongo server options when initializing modm for each template

#### `v0.2.9`
- fixed fetch template requests that were not converting `$in` `string` arrays into `ObjectId` arrays
- fixed template cache retrieval problem

#### `v0.2.8`
- fixed the cursor constructor name: `Cursor` instead of `Object`

#### `v0.2.7`
- TODO

#### `v0.2.6`

- fixed client bug when merging templates: links were polluting the template cache

#### `v0.2.5`

- fixed bug in recursive query conversion

#### `v0.2.4`

- added date conversion

#### `v0.2.3`

- set data as request.result

#### `v0.2.2`

- overwrite request.method. Return error in createError function

#### `v0.2.1`

- add fixed `cloneJSON` bug when handling `ObjectID`'s

#### `v0.2.0`

- added role template configuration overwriting

#### `v0.1.1`

- fixed wrong `M.on` server configuration for the `crud_read` event that was using `create` as the model operation to call

#### `v0.1.0`

- initial release
